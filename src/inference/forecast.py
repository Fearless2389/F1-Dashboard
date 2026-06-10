"""
Race Forecast — runs the Monte Carlo simulator on top of the trained
per-target models and produces the per-driver position distribution +
pole/winner picks for the new /forecast page.

Conceptually:
  1. Resolve the race + quali (same as predict_apex)
  2. Run predict_race for each target so we have prob_top10, prob_win,
     prob_podium, prob_dnf, prob_fastest_lap per driver
  3. Run monte_carlo_race for n iterations (default 10K) with those scores
  4. Aggregate to a curated bundle the API can serialise directly

Designed to be re-runnable cheaply — the simulator is sub-second for 10K
iters, the model.predict calls are the dominant cost.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from ..live.current_grid import get_current_grid
from ..live.schedule import enriched_schedule, next_race
from .apex import _resolve_quali
from .predict import predict_race
from .simulator import monte_carlo_race

log = logging.getLogger(__name__)


def _team_colour_for(team: Optional[str], grid: list[dict]) -> Optional[str]:
    if not team:
        return None
    for d in grid:
        if d.get("team_name") == team and d.get("team_colour"):
            return d["team_colour"]
    return None


def _headshot_for(code: str, grid: list[dict]) -> Optional[str]:
    for d in grid:
        if d.get("driver_code") == code:
            return d.get("headshot_url")
    return None


def _full_name_for(code: str, grid: list[dict]) -> Optional[str]:
    for d in grid:
        if d.get("driver_code") == code:
            return d.get("full_name")
    return None


def race_forecast(season: Optional[int] = None,
                  round_num: Optional[int] = None,
                  n_iterations: int = 10_000) -> dict:
    """Race-forecast bundle for one race. See module docstring."""
    # 1) Resolve race
    if season is None or round_num is None:
        nr = next_race(season)
        if nr is None:
            raise RuntimeError("Could not resolve next upcoming race")
        season = int(nr["season"])
        round_num = int(nr["round"])
        race_name = str(nr.get("race_name") or "")
        event_date = str(nr.get("event_date") or "") or None
        circuit_id = str(nr.get("circuit_id") or "")
    else:
        sched = enriched_schedule(season)
        row = sched[sched["round"] == round_num]
        if row.empty:
            raise RuntimeError(f"Round {round_num} not in season {season}")
        r = row.iloc[0]
        race_name = str(r.get("race_name") or "")
        event_date = str(r.get("event_date") or "") or None
        circuit_id = str(r.get("circuit_id") or "")

    # 2) Quali + grid metadata
    quali_df, quali_source = _resolve_quali(season, round_num)
    grid = get_current_grid(season) or []

    # 3) Run model predictions per target. _run returns a DataFrame with at
    # least driver_code + prob_top10 columns.
    def _run(model_name: str) -> pd.DataFrame:
        try:
            return predict_race(
                quali_input=quali_df,
                circuit_id=circuit_id,
                round_num=round_num,
                season=season,
                weather=None,
                model_name=model_name,
            )
        except Exception as exc:
            log.warning("Forecast: model %s failed: %s", model_name, exc)
            return pd.DataFrame()

    top10 = _run("xgb_top10.pkl")
    winner = _run("lgbm_winner.pkl")
    podium = _run("xgb_podium.pkl")
    dnf = _run("xgb_dnf.pkl")

    def _index(df: pd.DataFrame) -> dict[str, float]:
        if df.empty or "prob_top10" not in df.columns:
            return {}
        return dict(zip(df["driver_code"].tolist(), df["prob_top10"].astype(float).tolist()))

    top10_probs = _index(top10)
    winner_probs = _index(winner)
    podium_probs = _index(podium)
    dnf_probs = _index(dnf)

    # 4) Build the drivers input for monte_carlo_race. Use the quali frame
    # as the canonical roster — it's already filtered to the current grid.
    drivers_input = []
    for _, row in quali_df.iterrows():
        code = str(row["driver_code"])
        drivers_input.append({
            "driver_code":       code,
            "team_name":         str(row.get("team_name") or "") or None,
            "quali_position":    int(row.get("quali_position") or 10),
            "prob_top10":        top10_probs.get(code, 0.0),
            "prob_win":          winner_probs.get(code, top10_probs.get(code, 0.0)),
            "prob_podium":       podium_probs.get(code, 0.0),
            "prob_dnf":          max(0.0, min(1.0, dnf_probs.get(code, 0.1))),
            # prob_fastest_lap unavailable; fall through to score-weighted in MC.
        })

    if not drivers_input:
        raise RuntimeError("Forecast: no drivers to simulate")

    # 5) Monte Carlo
    mc = monte_carlo_race(drivers_input, n_iterations=n_iterations, seed=42)
    position_dist = mc["position_distribution"]
    expected_pos = mc["expected_position"]
    win_dist = mc["win_distribution"]
    podium_dist = mc["podium_distribution"]
    dnf_dist = mc.get("dnf_distribution") or {}

    # 6) Curate drivers — sort by expected_position so the matrix reads
    # top-of-grid → tail.
    drivers_out = []
    field_size = len(drivers_input)
    for d in drivers_input:
        code = d["driver_code"]
        team = d["team_name"]
        drivers_out.append({
            "driver_code":          code,
            "full_name":            _full_name_for(code, grid) or code,
            "team_name":            team,
            "team_colour":          _team_colour_for(team, grid),
            "expected_position":    float(expected_pos.get(code, float(field_size))),
            "win_prob":             float(win_dist.get(code, 0.0)),
            "podium_prob":          float(podium_dist.get(code, 0.0)),
            "dnf_prob":             float(dnf_dist.get(code, 0.0)),
            "position_distribution": position_dist.get(code, [0.0] * field_size),
        })
    drivers_out.sort(key=lambda d: d["expected_position"])

    # 7) Pole pick = highest predicted quali (lowest quali_position in input)
    pole_row = min(drivers_input, key=lambda d: int(d["quali_position"]) if d["quali_position"] else 99)
    pole_code = pole_row["driver_code"]
    # "Confidence" for pole — use that driver's P1 mass from the matrix as a
    # rough proxy (no separate pole simulation today).
    pole_prob = float(position_dist.get(pole_code, [0.0])[0]) if position_dist.get(pole_code) else 0.0
    pole_pick = {
        "driver_code":  pole_code,
        "full_name":    _full_name_for(pole_code, grid) or pole_code,
        "team_name":    pole_row.get("team_name"),
        "team_colour":  _team_colour_for(pole_row.get("team_name"), grid),
        "prob":         pole_prob,
    }

    # 8) Winner pick = highest win prob from the simulation
    winner_code = max(win_dist, key=win_dist.get) if win_dist else drivers_out[0]["driver_code"]
    winner_row = next((d for d in drivers_input if d["driver_code"] == winner_code), drivers_input[0])
    winner_pick = {
        "driver_code":  winner_code,
        "full_name":    _full_name_for(winner_code, grid) or winner_code,
        "team_name":    winner_row.get("team_name"),
        "team_colour":  _team_colour_for(winner_row.get("team_name"), grid),
        "prob":         float(win_dist.get(winner_code, 0.0)),
    }

    return {
        "race_meta": {
            "season":      season,
            "round":       round_num,
            "race_name":   race_name,
            "circuit_id":  circuit_id,
            "event_date":  event_date,
        },
        "pole_pick":     pole_pick,
        "winner_pick":   winner_pick,
        "drivers":       drivers_out,
        "n_simulations": int(n_iterations),
        "generated_at":  datetime.now(timezone.utc).isoformat(),
        "quali_source":  quali_source,
    }

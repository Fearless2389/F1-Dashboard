"""Replay endpoints — list, meta, per-lap snapshot, win-probability arc."""

import logging
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Response

from ...live.replay import load_race
from ...live.replay_index import load_index
from ...live.telemetry_replay import telemetry_window
from ..schemas import (
    OvertakeEvent,
    OvertakesResponse,
    ReplayMeta,
    ReplayRaceListEntry,
    TelemetryWindowResponse,
    TrajectoryResponse,
    WinProbabilityFrame,
    WinProbabilityResponse,
    WinProbabilityRow,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/replay", tags=["replay"])


# ── 1. List ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ReplayRaceListEntry])
def list_replays(season: int | None = Query(None, description="Filter by season")):
    idx = load_index()
    if idx.empty:
        return []
    if season is not None:
        idx = idx[idx["season"] == season]
    idx = idx.sort_values(["season", "round"], ascending=[False, True])
    return [
        ReplayRaceListEntry(
            season=int(r["season"]),
            round=int(r["round"]),
            race_name=str(r["race_name"]),
            circuit_id=str(r.get("circuit_id") or "") or None,
            event_date=str(r.get("event_date") or "") or None,
            n_laps=int(r["n_laps"]),
        )
        for _, r in idx.iterrows()
    ]


# ── 2. Race metadata ──────────────────────────────────────────────────────────

@router.get("/{season}/{round_num}", response_model=ReplayMeta)
def replay_meta(season: int, round_num: int) -> ReplayMeta:
    race = load_race(season, round_num)
    if race is None:
        raise HTTPException(404, f"No replay available for {season} R{round_num}")
    return ReplayMeta(**race.meta())


# ── 3. Per-lap snapshot ───────────────────────────────────────────────────────

@router.get("/{season}/{round_num}/snapshot")
def replay_snapshot(season: int, round_num: int, lap: int = Query(1, ge=1)) -> dict:
    race = load_race(season, round_num)
    if race is None:
        raise HTTPException(404, f"No replay available for {season} R{round_num}")
    return race.snapshot(lap)


# ── 3b. Continuous trajectory (powers the smooth playhead frontend) ───────────

@router.get("/{season}/{round_num}/trajectory", response_model=TrajectoryResponse)
def replay_trajectory(season: int, round_num: int) -> TrajectoryResponse:
    """One-shot payload: every driver's session-time-resolution progress curve.

    The frontend fetches this once per race, then drives playback locally via
    requestAnimationFrame — lerping between samples to get genuinely smooth dot
    motion. No per-lap polling required.
    """
    race = load_race(season, round_num)
    if race is None:
        raise HTTPException(404, f"No replay available for {season} R{round_num}")
    return TrajectoryResponse(**race.trajectory())


# ── 4. Win-probability arc ────────────────────────────────────────────────────

@lru_cache(maxsize=8)
def _win_prob_arc(season: int, round_num: int) -> dict | None:
    """
    Approximate win probabilities every 5 laps using the trained winner model.

    Heuristic: at each sample lap, feed the current grid order as "quali" input
    to the predict pipeline. Output `prob_top10` from the model gets normalised
    to a per-race distribution (so win-prob shares sum to 1 each lap). Drivers
    who've DNFed by the sample lap get 0.
    """
    race = load_race(season, round_num)
    if race is None:
        return None
    from ...inference.predict import predict_race
    from ..deps import load_model

    artifact = load_model("lgbm_winner.pkl")
    if artifact is None:
        return None

    sample_laps = list(range(1, race.n_laps + 1, 5))
    if sample_laps[-1] != race.n_laps:
        sample_laps.append(race.n_laps)

    # Build a stable column-major list of drivers ordered by final finish
    ordered_codes = [
        meta["driver_code"]
        for _, meta in sorted(
            race.drivers_meta.items(),
            key=lambda kv: kv[1].get("finish_position") or 99,
        )
        if meta.get("driver_code")
    ]

    frames: list[dict] = []
    for lap in sample_laps:
        snap = race.snapshot(lap)
        if not snap.get("drivers"):
            continue
        quali_df = pd.DataFrame([
            {
                "driver_code":     d["driver_code"],
                "team_name":       d["team_name"] or "Unknown",
                "quali_position":  d["position"],
            }
            for d in snap["drivers"][:20]
        ])
        try:
            out = predict_race(
                quali_input=quali_df,
                circuit_id=race.circuit_id or "",
                round_num=race.round,
                season=race.season,
                weather=None,
                model_name="lgbm_winner.pkl",
            )
        except Exception as exc:
            log.warning("predict_race failed at %s R%s lap %s: %s",
                        race.season, race.round, lap, exc)
            continue
        if out.empty:
            continue
        # Normalise to probability shares
        scores = out["prob_top10"].astype(float).values
        total = float(scores.sum())
        if total <= 0:
            continue
        probs = scores / total
        row_map = {code: 0.0 for code in ordered_codes}
        for code, p in zip(out["driver_code"].tolist(), probs):
            if code in row_map:
                row_map[code] = float(p)
        frames.append({"lap": int(lap), "rows": [
            {"driver_code": code, "prob": row_map[code]} for code in ordered_codes
        ]})

    return {
        "season":  race.season,
        "round":   race.round,
        "n_laps":  race.n_laps,
        "drivers": ordered_codes,
        "frames":  frames,
    }


# ── 3c. Per-driver per-tick telemetry slice (Speed / Throttle / Brake / Gear)

@router.get("/{season}/{round_num}/telemetry/{driver_code}",
            response_model=TelemetryWindowResponse,
            responses={204: {"description": "Telemetry not cached for this race"}})
def replay_telemetry(
    season: int,
    round_num: int,
    driver_code: str,
    from_t: float = Query(..., description="Session time (seconds) — window start"),
    to_t:   float = Query(..., description="Session time (seconds) — window end"),
):
    """30 s rolling-window telemetry slice for a single driver, used by the
    DriverTelemetry mini-window on the replay page.

    Returns 204 when the race's `car_data.ff1pkl` isn't on disk (older
    2024/earlier sessions were ingested with `telemetry=False`).
    """
    if to_t <= from_t:
        raise HTTPException(400, "to_t must be greater than from_t")
    payload = telemetry_window(season, round_num, driver_code.upper(), from_t, to_t)
    if payload is None:
        return Response(status_code=204)
    return TelemetryWindowResponse(**payload)


@router.get("/{season}/{round_num}/overtakes", response_model=OvertakesResponse)
def replay_overtakes(season: int, round_num: int) -> OvertakesResponse:
    race = load_race(season, round_num)
    if race is None:
        raise HTTPException(404, f"No replay available for {season} R{round_num}")
    events = race.overtakes()
    return OvertakesResponse(
        season=season,
        round=round_num,
        total=len(events),
        events=[OvertakeEvent(**e) for e in events],
    )


@router.get("/{season}/{round_num}/win_probability", response_model=WinProbabilityResponse)
def replay_win_probability(season: int, round_num: int) -> WinProbabilityResponse:
    arc = _win_prob_arc(season, round_num)
    if arc is None:
        raise HTTPException(404, f"Cannot compute win probability for {season} R{round_num}")
    return WinProbabilityResponse(
        season=arc["season"],
        round=arc["round"],
        n_laps=arc["n_laps"],
        drivers=arc["drivers"],
        frames=[
            WinProbabilityFrame(
                lap=f["lap"],
                rows=[WinProbabilityRow(**r) for r in f["rows"]],
            )
            for f in arc["frames"]
        ],
    )

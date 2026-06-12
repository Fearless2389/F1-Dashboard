"""
Per-driver performance metrics — real numbers from the aligned dataset.

These power the Performance Radar + Aggression / Experience cards on the
driver profile page. All metrics are normalised to 0..100 for radar use.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Optional

import numpy as np
import pandas as pd

from ..ingestion.config import DATA_PROCESSED, DATA_RAW, LAP_DATA_FILE
from .config import DATA_SCHEDULE

log = logging.getLogger(__name__)

ALIGNED_FILE = DATA_PROCESSED / "aligned_race_dataset.parquet"
# Imported here so older snapshots / smoke tests don't drop the symbol;
# we read it lazily inside _load_lap_data.
_LAP_DATA_PATH = LAP_DATA_FILE if LAP_DATA_FILE.exists() else DATA_RAW / "lap_data.parquet"

# `finish_status` strings that indicate on-track incidents (driver aggression
# or wheel-to-wheel mistakes), as opposed to mechanical / team errors.
_ACCIDENT_STATUSES = {
    "accident", "collision", "collision damage", "spun off",
    "damage", "crash", "driver error", "fatal accident",
}


@lru_cache(maxsize=1)
def _load_aligned() -> Optional[pd.DataFrame]:
    if not ALIGNED_FILE.exists():
        return None
    return pd.read_parquet(ALIGNED_FILE)


@lru_cache(maxsize=1)
def _load_lap_data() -> Optional[pd.DataFrame]:
    """data/raw/lap_data.parquet — used by the Tyre Management radar axis.
    Has `season, round, driver_code, lap_number, compound, tyre_life, stint`.
    Returns None on older deploys that haven't ingested lap data yet."""
    if not _LAP_DATA_PATH.exists():
        return None
    return pd.read_parquet(_LAP_DATA_PATH)


def _teammate_h2h(
    driver_code: str, sample: pd.DataFrame, full_df: pd.DataFrame, kind: str,
) -> Optional[float]:
    """% of races (in `sample`) where the driver beat their team-mate on the
    chosen `kind`. `kind="quali"` compares quali_position; `kind="race"`
    compares finish_position_clean and only counts races where BOTH cars
    were classified (no DNFs).

    Returns None when fewer than 3 matchups exist (small-sample veto so
    the radar doesn't show 0% or 100% off a single result).
    """
    pos_col = "quali_position" if kind == "quali" else "finish_position_clean"
    wins = 0
    matchups = 0
    for _, row in sample.iterrows():
        team = row.get("team_name")
        season = row.get("season")
        rnd = row.get("round")
        self_pos = row.get(pos_col)
        if pd.isna(self_pos) or pd.isna(team):
            continue
        if kind == "race" and bool(row.get("is_dnf")):
            continue
        mates = full_df[
            (full_df["season"] == season)
            & (full_df["round"] == rnd)
            & (full_df["team_name"] == team)
            & (full_df["driver_code"] != driver_code)
        ]
        for _, mate in mates.iterrows():
            mate_pos = mate.get(pos_col)
            if pd.isna(mate_pos):
                continue
            if kind == "race" and bool(mate.get("is_dnf")):
                continue
            matchups += 1
            if float(self_pos) < float(mate_pos):
                wins += 1
            break  # only one team-mate per race
    if matchups < 3:
        return None
    return (wins / matchups) * 100.0


def _consistency_vs_teammate(
    driver_code: str, sample: pd.DataFrame, full_df: pd.DataFrame,
) -> Optional[float]:
    """100 - stdev(driver_finish - teammate_finish) × 15. Lower spread
    means the driver delivers a predictable result relative to the same
    car — the cleanest skill-vs-car-controlled "consistency" signal we
    can get without per-lap data. Multiplier of 15 calibrated so:
      stdev 0 → 100 (delta is identical every race — flawless)
      stdev 2 → 70 (typical mid-field driver)
      stdev 4 → 40 (volatile)
      stdev 6 → 10 (chaotic)
    Both cars must be classified (no DNFs) for a delta to count. Returns
    None with fewer than 3 deltas (small-sample veto).
    """
    deltas: list[float] = []
    for _, row in sample.iterrows():
        team = row.get("team_name")
        season = row.get("season")
        rnd = row.get("round")
        self_pos = row.get("finish_position_clean")
        if pd.isna(self_pos) or pd.isna(team) or bool(row.get("is_dnf")):
            continue
        mates = full_df[
            (full_df["season"] == season)
            & (full_df["round"] == rnd)
            & (full_df["team_name"] == team)
            & (full_df["driver_code"] != driver_code)
        ]
        for _, mate in mates.iterrows():
            mate_pos = mate.get("finish_position_clean")
            if pd.isna(mate_pos) or bool(mate.get("is_dnf")):
                continue
            deltas.append(float(self_pos) - float(mate_pos))
            break
    if len(deltas) < 3:
        return None
    return _clip01(100.0 - float(np.nanstd(deltas)) * 15.0)


def _tyre_management(driver_code: str, sample: pd.DataFrame) -> Optional[float]:
    """Real tyre-management signal from lap_data.parquet.

    For each (season, round) the driver entered:
      1. Find the longest stint they ran per compound (max tyre_life per
         (driver, compound, stint) tuple).
      2. Compare to the field's median longest stint on the same compound
         at that race (controls for circuit + weather).
      3. Average the (driver - field) lap deltas across the sample window.

    Map: 0 lap delta → 50, +10 laps over field median → 100, −10 → 0.
    Returns None when lap_data is missing or the sample has fewer than 3
    usable compound-stints (e.g. pre-2025 races aren't in lap_data yet).
    """
    lap_df = _load_lap_data()
    if lap_df is None or lap_df.empty:
        return None
    deltas: list[float] = []
    for _, row in sample.iterrows():
        season = row.get("season")
        rnd = row.get("round")
        race = lap_df[(lap_df["season"] == season) & (lap_df["round"] == rnd)]
        if race.empty:
            continue
        # Longest stint per (driver, compound, stint) — tyre_life increments
        # within a stint, so the max IS the stint's length.
        stints = (
            race.dropna(subset=["compound", "stint", "tyre_life"])
                .groupby(["driver_code", "compound", "stint"], dropna=False)["tyre_life"]
                .max()
                .reset_index()
        )
        my = stints[stints["driver_code"] == driver_code]
        if my.empty:
            continue
        for _, ms in my.iterrows():
            compound = ms["compound"]
            field = stints[stints["compound"] == compound]
            if len(field) < 3:
                continue  # too few same-compound runners to compare against
            deltas.append(float(ms["tyre_life"]) - float(field["tyre_life"].median()))
    if len(deltas) < 3:
        return None
    return _clip01(50.0 + float(np.nanmean(deltas)) * 5.0)


@lru_cache(maxsize=1)
def _debut_years_2026() -> dict[str, int]:
    """Hand-curated debut year per current driver. Used to compute experience
    honestly for drivers whose careers started before our 2018+ data window
    (Hamilton, Alonso, Hülkenberg, Pérez, Bottas)."""
    p = DATA_SCHEDULE / "drivers_2026.json"
    if not p.exists():
        return {}
    try:
        roster = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {
        str(r["driver_code"]): int(r["debut_year"])
        for r in roster if r.get("debut_year") is not None
    }


def _normalise_position(pos: float) -> float:
    """Convert a finish/quali position (1..20) → 0..100 score (P1=100, P20=0)."""
    if pos is None or pd.isna(pos):
        return 50.0
    return max(0.0, min(100.0, ((21 - pos) / 20.0) * 100))


def _clip01(v: float) -> float:
    return float(max(0.0, min(100.0, v)))


def compute_metrics(driver_code: str, season: Optional[int] = None) -> dict:
    """
    Returns a fully-real metrics bundle for `driver_code`:

      {
        "radar": {qualifying, race_pace, tyre_mgmt, consistency, overtaking},
        "aggression_pct":  int 0..100 (DNF rate × 100, capped 100)
        "experience_pct":  int 0..100 (career-race percentile against the field)
        "career_races":    int
        "last_10":         [ ... last 10 races (most-recent first) ... ]
      }

    If `season` is provided, the radar samples ONLY that season; otherwise it
    samples the most-recent 20 races. Career stats always use full history.
    """
    df = _load_aligned()
    if df is None or df.empty:
        return _empty_metrics()

    hist = df[df["driver_code"] == driver_code].sort_values(["season", "round"])
    if hist.empty:
        return _empty_metrics()

    # ── Career experience metrics ────────────────────────────────────────────
    career_races = int(len(hist))

    # Experience % — new criterion (Phase 15.1):
    #   Prefer YEARS SINCE F1 DEBUT (from drivers_2026.json), normalised so
    #   25 years (Alonso) → 100, 0 years (rookie) → 0.
    #   For drivers without a curated debut year, fall back to a race-count
    #   percentile within our dataset.
    debut_year = _debut_years_2026().get(driver_code)
    if debut_year is not None:
        reference_year = season if season is not None else int(hist["season"].max())
        years_in_f1 = max(0, reference_year - debut_year)
        # Map 0..25 years → 0..100, capped
        experience_pct = int(round(min(100.0, (years_in_f1 / 25.0) * 100.0)))
    else:
        # Historical / non-2026 driver: percentile within their era
        races_per_driver = df.groupby("driver_code").size()
        pct = (races_per_driver < career_races).mean() * 100
        experience_pct = int(round(pct))

    # ── Radar sample window ──────────────────────────────────────────────────
    if season is not None:
        sample = hist[hist["season"] == season]
        if sample.empty:
            # Driver hasn't raced this season yet — fall back to last 10 across career
            sample = hist.tail(10)
    else:
        sample = hist.tail(20)

    # Each radar axis now prefers the controlled (team-mate / lap-data)
    # measurement when enough matchups exist, and falls back to the old
    # absolute-position formulae when they don't (e.g. solo drivers,
    # historical drivers from before 2025 lap data, or freshly-debuted
    # rookies without enough matchups). Fallback yields the v1 number,
    # never a hardcoded 50 — so the radar is always meaningfully shaped.
    finishes = sample["finish_position_clean"].dropna()
    qualis = sample["quali_position"].dropna()

    # ── Radar: Qualifying ────────────────────────────────────────────────────
    # Preferred: team-mate quali head-to-head %.
    # Fallback: normalised quali position vs field.
    quali_h2h = _teammate_h2h(driver_code, sample, df, kind="quali")
    if quali_h2h is not None:
        qualifying = quali_h2h
    else:
        qualifying = float(qualis.apply(_normalise_position).mean()) if len(qualis) else 50.0

    # ── Radar: Race Pace ─────────────────────────────────────────────────────
    # Preferred: team-mate race finish head-to-head %.
    # Fallback: normalised finish position vs field.
    race_h2h = _teammate_h2h(driver_code, sample, df, kind="race")
    if race_h2h is not None:
        race_pace = race_h2h
    else:
        race_pace = float(finishes.apply(_normalise_position).mean()) if len(finishes) else 50.0

    # ── Radar: Consistency ───────────────────────────────────────────────────
    # Preferred: 100 − stdev(finish delta vs team-mate) × 25.
    # Fallback: 100 − stdev(finish) / 7 × 100 (the old absolute formula).
    cons_h2h = _consistency_vs_teammate(driver_code, sample, df)
    if cons_h2h is not None:
        consistency = cons_h2h
    elif len(finishes) >= 3:
        std = float(np.nanstd(finishes.values))
        consistency = _clip01(100 - (std / 7.0) * 100)
    else:
        consistency = 50.0

    # ── Radar: Overtaking ────────────────────────────────────────────────────
    # Average positions gained per FINISHED race (DNFs excluded so a single
    # crash doesn't tank the metric). Mapping unchanged: +3 → 80, 0 → 50, −3 → 20.
    if "grid_position" in sample.columns:
        gainers = sample.dropna(subset=["grid_position", "finish_position_clean"])
        if "is_dnf" in gainers.columns:
            gainers = gainers[~gainers["is_dnf"].astype(bool)]
        if len(gainers) >= 3:
            delta = (gainers["grid_position"].astype(float)
                     - gainers["finish_position_clean"].astype(float)).mean()
            overtaking = _clip01(50 + delta * 10)
        else:
            overtaking = 50.0
    else:
        overtaking = 50.0

    # ── Radar: Tyre Management ───────────────────────────────────────────────
    # Preferred: per-race longest stint vs field median, averaged across
    # the sample window (real measurement out of lap_data.parquet).
    # Fallback: the old proxy mixing consistency + (1 − DNF rate). Pre-2025
    # races aren't in lap_data, so historical drivers always hit the
    # fallback. That's a known, documented limitation.
    tyre_mgmt_real = _tyre_management(driver_code, sample)
    if tyre_mgmt_real is not None:
        tyre_mgmt = tyre_mgmt_real
    else:
        dnf_rate = float(sample["is_dnf"].mean()) if "is_dnf" in sample.columns else 0.1
        tyre_mgmt = _clip01(0.6 * consistency + 0.4 * (100 - dnf_rate * 100))

    # ── Aggression — new criterion (Phase 15.1):
    # Parse `finish_status` for on-track-incident terms (collision, accident,
    # spun off, damage). Pure mechanical DNFs (engine, gearbox, hydraulics,
    # power unit, brakes) are excluded — those aren't an aggression signal.
    #   accident_rate = collisions / total races
    # Mapped: 0% → 0, 5% accident rate → ~50, 10%+ → 100.
    full_hist = hist
    if "finish_status" in full_hist.columns:
        statuses = full_hist["finish_status"].fillna("").astype(str).str.strip().str.lower()
        n_accidents = int(statuses.isin(_ACCIDENT_STATUSES).sum())
        accident_rate = n_accidents / max(len(full_hist), 1)
        aggression_pct = int(round(_clip01(accident_rate * 1000)))   # ×10 then ×100 cap
    else:
        aggression_pct = 0

    # ── Last 10 races ────────────────────────────────────────────────────────
    last_10_df = hist.tail(10).iloc[::-1]   # most-recent first
    last_10 = []
    for _, row in last_10_df.iterrows():
        fin = row.get("finish_position_clean")
        last_10.append({
            "season":          int(row["season"]),
            "round":           int(row["round"]),
            "race_name":       str(row.get("race_name") or ""),
            "circuit_id":      str(row.get("circuit_id") or ""),
            "grid_position":   int(row["grid_position"]) if pd.notna(row.get("grid_position")) else None,
            "finish_position": int(fin) if pd.notna(fin) else None,
            "points":          float(row["points"]) if pd.notna(row.get("points")) else 0.0,
            "is_dnf":          bool(row.get("is_dnf")),
        })

    # ── L10 dashboard stats (source-of-truth for BigStat tiles) ─────────────
    # Computed here from the LIVE aligned dataset so each driver gets a real,
    # distinct value. The feature_matrix copy used to back these was last
    # rebuilt before 2026 ingestion, so it returned identical end-of-2025
    # snapshots for everyone.
    last_10_pd = hist.tail(10)
    if len(last_10_pd):
        finishes_l10 = last_10_pd["finish_position_clean"].dropna()
        avg_finish_l10 = float(finishes_l10.mean()) if len(finishes_l10) else None
        dnf_rate_l10 = float(last_10_pd["is_dnf"].mean()) if "is_dnf" in last_10_pd.columns else None
    else:
        avg_finish_l10 = None
        dnf_rate_l10 = None

    return {
        "radar": {
            "qualifying":  round(qualifying, 1),
            "race_pace":   round(race_pace, 1),
            "tyre_mgmt":   round(tyre_mgmt, 1),
            "consistency": round(consistency, 1),
            "overtaking":  round(overtaking, 1),
        },
        "aggression_pct":  aggression_pct,
        "experience_pct":  experience_pct,
        "career_races":    career_races,
        "last_10":         last_10,
        "avg_finish_L10":  round(avg_finish_l10, 2) if avg_finish_l10 is not None else None,
        "dnf_rate_L10":    round(dnf_rate_l10, 3) if dnf_rate_l10 is not None else None,
    }


def _empty_metrics() -> dict:
    return {
        "radar": {
            "qualifying": 50.0, "race_pace": 50.0, "tyre_mgmt": 50.0,
            "consistency": 50.0, "overtaking": 50.0,
        },
        "aggression_pct":  0,
        "experience_pct":  0,
        "career_races":    0,
        "last_10":         [],
        "avg_finish_L10":  None,
        "dnf_rate_L10":    None,
    }

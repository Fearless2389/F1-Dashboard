"""
Practice session features (FP1 / FP2 / FP3).

Populates per-driver pre-race signals from practice sessions:
  - fp_long_run_median_ms
  - fp_quali_sim_pace_ms
  - fp_gap_to_fastest_pct

Requires practice-session lap data ingested via fastf1.get_session(season, round, "FPx").
This module is *optional* — if the practice parquet doesn't exist, callers
should treat the columns as NaN and let the existing imputer handle them.
"""

import logging
from pathlib import Path
from typing import Optional

import pandas as pd

from ..ingestion.config import DATA_RAW

log = logging.getLogger(__name__)

PRACTICE_LAPS_FILE = DATA_RAW / "practice_lap_data.parquet"


def compute_practice_features(practice_laps: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """
    Build per-(season, round, driver_code) practice-pace features.

    `practice_laps` columns expected: season, round, session, driver_code,
                                     lap_time_ms, compound, fuel_load (optional)
    Returns empty DataFrame if input missing.
    """
    if practice_laps is None:
        if not PRACTICE_LAPS_FILE.exists():
            return pd.DataFrame()
        practice_laps = pd.read_parquet(PRACTICE_LAPS_FILE)

    if practice_laps.empty:
        return pd.DataFrame()

    df = practice_laps.copy()

    # Long-run median: take FP2 + FP3, drop top/bottom 10% per stint, median the rest
    long_run = df[df["session"].isin(["FP2", "FP3"])].copy()
    if not long_run.empty and "lap_time_ms" in long_run.columns:
        keep = (
            long_run.groupby(["season", "round", "driver_code"])["lap_time_ms"]
            .transform(lambda x: x.between(x.quantile(0.1), x.quantile(0.9)))
        )
        long_run = long_run[keep]

    long_summary = (
        long_run.groupby(["season", "round", "driver_code"])["lap_time_ms"]
        .median()
        .rename("fp_long_run_median_ms")
        .reset_index()
    )

    # Quali-sim: best single lap in FP3
    fp3 = df[df["session"] == "FP3"]
    quali_sim = (
        fp3.groupby(["season", "round", "driver_code"])["lap_time_ms"]
        .min()
        .rename("fp_quali_sim_pace_ms")
        .reset_index()
    )

    # Gap to fastest in FP3
    if not quali_sim.empty:
        fastest = (
            quali_sim.groupby(["season", "round"])["fp_quali_sim_pace_ms"]
            .min()
            .rename("_fastest_fp3")
            .reset_index()
        )
        quali_sim = quali_sim.merge(fastest, on=["season", "round"], how="left")
        quali_sim["fp_gap_to_fastest_pct"] = (
            (quali_sim["fp_quali_sim_pace_ms"] - quali_sim["_fastest_fp3"])
            / quali_sim["_fastest_fp3"]
        ) * 100.0
        quali_sim.drop(columns=["_fastest_fp3"], inplace=True)

    out = long_summary.merge(quali_sim, on=["season", "round", "driver_code"], how="outer")
    return out

"""
Phase 2 — Data Cleaning & Alignment

Joins race results, qualifying, and weather into one aligned dataset.
Each row = one driver in one race.

Inputs:
    data/raw/race_results.parquet
    data/raw/qualifying_results.parquet
    data/raw/weather_data.parquet

Output:
    data/processed/aligned_race_dataset.parquet

Usage:
    python -m src.cleaning.align
"""

import logging
import sys

import numpy as np
import pandas as pd

from ..ingestion.config import (
    DATA_PROCESSED,
    QUALI_RESULTS_FILE,
    RACE_RESULTS_FILE,
    WEATHER_FILE,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

OUTPUT_FILE = DATA_PROCESSED / "aligned_race_dataset.parquet"

# Statuses that count as a classified finish
FINISH_STATUSES = {"Finished", "+1 Lap", "+2 Laps", "+3 Laps", "+4 Laps", "+5 Laps"}


# ── Loaders ───────────────────────────────────────────────────────────────────

def _load(path, label: str) -> pd.DataFrame:
    if not path.exists():
        log.error(f"{label} not found at {path}. Run fetch_sessions.py first.")
        sys.exit(1)
    df = pd.read_parquet(path)
    log.info(f"Loaded {label}: {len(df):,} rows")
    return df


# ── Cleaning steps ────────────────────────────────────────────────────────────

def _clean_race(df: pd.DataFrame) -> pd.DataFrame:
    """Clean raw race results."""
    df = df.copy()

    # DNF flag: anything not a classified finish
    df["is_dnf"] = (~df["finish_status"].isin(FINISH_STATUSES)).astype("int8")

    # Classified position: DNFs get worst position (20)
    # finish_position is already NaN for non-classified — fill with 20
    df["finish_position_clean"] = (
        df["finish_position"]
        .fillna(20)
        .clip(upper=20)
        .astype("float32")
    )

    # Target variable
    df["top_10"] = (df["finish_position_clean"] <= 10).astype("int8")

    # Grid position: 0 means pit lane start — recode to 20 (worst)
    df["grid_position"] = (
        df["grid_position"]
        .replace(0, 20)
        .fillna(20)
        .astype("int8")
    )

    # Drop rows with no driver code (data corruption)
    df = df[df["driver_code"].notna() & (df["driver_code"] != "")]

    return df


def _clean_quali(df: pd.DataFrame) -> pd.DataFrame:
    """Clean raw qualifying results."""
    df = df.copy()

    # Best qualifying time across Q1/Q2/Q3
    time_cols = [c for c in ["q1_time_ms", "q2_time_ms", "q3_time_ms"] if c in df.columns]
    df["best_quali_time_ms"] = df[time_cols].min(axis=1)

    # Drop rows with no meaningful quali time
    df = df[df["best_quali_time_ms"].notna()]

    return df


def _add_quali_gap_to_pole(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add gap-to-pole for each driver in each race.
    Pole = minimum best_quali_time_ms per (season, round).
    """
    pole_times = (
        df.groupby(["season", "round"])["best_quali_time_ms"]
        .min()
        .rename("pole_time_ms")
        .reset_index()
    )
    df = df.merge(pole_times, on=["season", "round"], how="left")
    df["quali_gap_to_pole_ms"] = (df["best_quali_time_ms"] - df["pole_time_ms"]).astype("float64")
    df.drop(columns=["pole_time_ms"], inplace=True)
    return df


def _handle_sprint_weekends(race_df: pd.DataFrame, quali_df: pd.DataFrame) -> pd.DataFrame:
    """
    Sprint weekends use Sprint Qualifying (SQ) instead of Q.
    FastF1 still labels them 'Q' in some seasons — this handles cases
    where qualifying data is missing for a round by forward-filling
    grid_position as a proxy.
    """
    race_rounds  = set(zip(race_df["season"], race_df["round"]))
    quali_rounds = set(zip(quali_df["season"], quali_df["round"]))
    sprint_rounds = race_rounds - quali_rounds

    if sprint_rounds:
        seasons = sorted({s for s, _ in sprint_rounds})
        log.warning(
            f"  {len(sprint_rounds)} sprint/missing quali rounds detected "
            f"(seasons {seasons}). Qualifying data will be NaN for those rounds."
        )
    return quali_df


# ── Alignment ─────────────────────────────────────────────────────────────────

def align(
    race_df: pd.DataFrame,
    quali_df: pd.DataFrame,
    weather_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Join race + qualifying + weather into one aligned dataset.
    Key: (season, round, driver_code)
    """

    quali_cols = [
        "season", "round", "driver_code",
        "quali_position", "q1_time_ms", "q2_time_ms", "q3_time_ms",
        "best_quali_time_ms", "quali_gap_to_pole_ms",
    ]
    quali_subset = quali_df[[c for c in quali_cols if c in quali_df.columns]]

    weather_cols = [
        "season", "round",
        "air_temp_mean", "track_temp_mean",
        "humidity_mean", "wind_speed_mean", "rainfall",
    ]
    weather_subset = weather_df[[c for c in weather_cols if c in weather_df.columns]]

    # Left join: keep all race rows even if quali/weather missing
    merged = race_df.merge(quali_subset, on=["season", "round", "driver_code"], how="left")
    merged = merged.merge(weather_subset, on=["season", "round"], how="left")

    return merged


# ── Validation ────────────────────────────────────────────────────────────────

def _validate(df: pd.DataFrame) -> None:
    n_rows    = len(df)
    n_races   = df.groupby(["season", "round"]).ngroups
    n_seasons = df["season"].nunique()
    dnf_rate  = df["is_dnf"].mean()
    top10_rate = df["top_10"].mean()

    log.info(f"  Rows:          {n_rows:,}")
    log.info(f"  Seasons:       {n_seasons}  ({df['season'].min()}–{df['season'].max()})")
    log.info(f"  Races:         {n_races}")
    log.info(f"  DNF rate:      {dnf_rate:.1%}")
    log.info(f"  Top-10 rate:   {top10_rate:.1%}  (expect ~50%)")

    # Sanity: ~20 drivers per race
    drivers_per_race = df.groupby(["season", "round"])["driver_code"].count()
    log.info(f"  Drivers/race:  {drivers_per_race.mean():.1f} avg  "
             f"(min {drivers_per_race.min()}, max {drivers_per_race.max()})")

    # Check for unexpected nulls on key columns
    key_cols = ["driver_code", "team_name", "grid_position",
                "finish_position_clean", "is_dnf", "top_10"]
    null_counts = df[key_cols].isnull().sum()
    if null_counts.any():
        log.warning(f"  Nulls in key columns:\n{null_counts[null_counts > 0]}")
    else:
        log.info("  No nulls in key columns")


# ── Main ──────────────────────────────────────────────────────────────────────

def run() -> pd.DataFrame:
    log.info("Phase 2 — Cleaning & Alignment")

    race_raw    = _load(RACE_RESULTS_FILE,  "race results")
    quali_raw   = _load(QUALI_RESULTS_FILE, "qualifying results")
    weather_raw = _load(WEATHER_FILE,        "weather data")

    log.info("Cleaning race results...")
    race_clean = _clean_race(race_raw)

    log.info("Cleaning qualifying results...")
    quali_clean = _clean_quali(quali_raw)
    quali_clean = _add_quali_gap_to_pole(quali_clean)
    _handle_sprint_weekends(race_clean, quali_clean)

    log.info("Aligning datasets...")
    aligned = align(race_clean, quali_clean, weather_raw)

    # Consistent column ordering
    id_cols = ["season", "round", "race_name", "circuit_id",
               "driver_code", "driver_number", "team_name"]
    target  = ["top_10"]
    rest    = [c for c in aligned.columns if c not in id_cols + target]
    aligned = aligned[id_cols + target + rest]

    log.info("Validation:")
    _validate(aligned)

    aligned.to_parquet(OUTPUT_FILE, index=False)
    log.info(f"Saved → {OUTPUT_FILE}")

    return aligned


if __name__ == "__main__":
    run()

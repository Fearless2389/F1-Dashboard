"""
Phase 3 — Pace & Strategy Feature Engineering

Derived from lap_data.parquet. Each feature is aggregated to
(season, round, driver_code) before being merged into the main dataset.

NOTE on leakage:
  Pace features use in-race lap data. For TRAINING this is valid —
  the model learns the relationship between race pace and finishing position.
  For INFERENCE (Phase 6), qualifying sector times substitute these features
  since race data is not available pre-race.

Input:  lap_data (DataFrame)
Output: DataFrame with one row per (season, round, driver_code), pace + strategy cols
"""

import numpy as np
import pandas as pd
from scipy import stats


COMPOUND_MAP = {
    "SOFT":         0,
    "MEDIUM":       1,
    "HARD":         2,
    "INTERMEDIATE": 3,
    "WET":          4,
    "UNKNOWN":      -1,
}

# track_status == "1" means clear (no SC/VSC/yellow)
CLEAR_TRACK_STATUS = "1"


def _degradation_slope(lap_times: pd.Series) -> float:
    """Linear regression slope of lap times over laps within a stint (ms/lap)."""
    if len(lap_times) < 3:
        return np.nan
    x = np.arange(len(lap_times))
    slope, *_ = stats.linregress(x, lap_times)
    return float(slope)


def _compute_pace(lap_data: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-driver pace features from race laps.
    Returns one row per (season, round, driver_code).
    """
    laps = lap_data.copy()

    # ── Clean air laps: accurate + clear track ────────────────────────────────
    clean = laps[
        laps["is_accurate"].fillna(False) &
        (laps["track_status"].fillna("") == CLEAR_TRACK_STATUS) &
        laps["lap_time_ms"].notna() &
        (laps["lap_time_ms"] > 0)
    ]

    pace = (
        clean.groupby(["season", "round", "driver_code"])["lap_time_ms"]
        .median()
        .reset_index()
        .rename(columns={"lap_time_ms": "median_clean_lap_ms"})
    )

    # ── Field-normalised pace ─────────────────────────────────────────────────
    # Add race median to compute % above/below field
    race_median = (
        clean.groupby(["season", "round"])["lap_time_ms"]
        .median()
        .reset_index()
        .rename(columns={"lap_time_ms": "field_median_lap_ms"})
    )
    pace = pace.merge(race_median, on=["season", "round"], how="left")
    pace["lap_time_vs_field_pct"] = (
        (pace["median_clean_lap_ms"] - pace["field_median_lap_ms"])
        / pace["field_median_lap_ms"] * 100
    ).astype("float32")
    pace.drop(columns=["field_median_lap_ms"], inplace=True)

    # ── Sector consistency ────────────────────────────────────────────────────
    sector_std = (
        clean.groupby(["season", "round", "driver_code"])[
            ["sector1_ms", "sector2_ms", "sector3_ms"]
        ]
        .std()
        .mean(axis=1)  # average std across sectors
        .reset_index()
        .rename(columns={0: "sector_consistency"})
    )
    pace = pace.merge(sector_std, on=["season", "round", "driver_code"], how="left")
    pace["sector_consistency"] = pace["sector_consistency"].astype("float32")

    return pace


def _compute_degradation(lap_data: pd.DataFrame) -> pd.DataFrame:
    """
    Compute tyre degradation slope per driver per race.
    Uses the longest stint (most data points) for each driver.
    """
    laps = lap_data[
        lap_data["is_accurate"].fillna(False) &
        lap_data["lap_time_ms"].notna() &
        (lap_data["lap_time_ms"] > 0) &
        lap_data["stint"].notna()
    ].copy()

    # Find longest stint per driver per race
    stint_lengths = (
        laps.groupby(["season", "round", "driver_code", "stint"])
        .size()
        .reset_index(name="stint_len")
    )
    longest = (
        stint_lengths.sort_values("stint_len", ascending=False)
        .groupby(["season", "round", "driver_code"])
        .first()
        .reset_index()
    )

    laps = laps.merge(
        longest[["season", "round", "driver_code", "stint"]],
        on=["season", "round", "driver_code", "stint"],
        how="inner",
    )

    deg = (
        laps.sort_values("lap_number")
        .groupby(["season", "round", "driver_code"])["lap_time_ms"]
        .apply(_degradation_slope)
        .reset_index()
        .rename(columns={"lap_time_ms": "deg_slope"})
    )
    deg["deg_slope"] = deg["deg_slope"].astype("float32")
    return deg


def _compute_strategy(lap_data: pd.DataFrame) -> pd.DataFrame:
    """
    Compute strategy features per driver per race:
    starting compound, number of stints, number of pit stops.
    """
    laps = lap_data.copy()

    # Starting compound: compound on stint 1
    starting = (
        laps[laps["stint"] == 1]
        .groupby(["season", "round", "driver_code"])["compound"]
        .first()
        .reset_index()
        .rename(columns={"compound": "starting_compound"})
    )
    starting["starting_compound"] = starting["starting_compound"].fillna("UNKNOWN").str.upper()
    starting["starting_compound_enc"] = (
        starting["starting_compound"].map(COMPOUND_MAP).fillna(-1).astype("int8")
    )

    # Number of stints
    num_stints = (
        laps.groupby(["season", "round", "driver_code"])["stint"]
        .max()
        .reset_index()
        .rename(columns={"stint": "num_stints"})
    )
    num_stints["num_stints"] = num_stints["num_stints"].fillna(1).astype("int8")

    # Pit stops: laps where pit_in_time is not null
    num_pits = (
        laps[laps["pit_in_time"].notna()]
        .groupby(["season", "round", "driver_code"])
        .size()
        .reset_index(name="num_pit_stops")
    )
    num_pits["num_pit_stops"] = num_pits["num_pit_stops"].astype("int8")

    strategy = starting.merge(num_stints, on=["season", "round", "driver_code"], how="left")
    strategy = strategy.merge(num_pits, on=["season", "round", "driver_code"], how="left")
    strategy["num_pit_stops"] = strategy["num_pit_stops"].fillna(0).astype("int8")

    return strategy


def compute_lap_features(lap_data: pd.DataFrame) -> pd.DataFrame:
    """
    Master function: compute all pace + strategy features from lap_data.
    Returns one row per (season, round, driver_code).
    """
    if lap_data is None or lap_data.empty:
        return pd.DataFrame(columns=[
            "season", "round", "driver_code",
            "median_clean_lap_ms", "lap_time_vs_field_pct", "sector_consistency",
            "deg_slope",
            "starting_compound", "starting_compound_enc",
            "num_stints", "num_pit_stops",
        ])

    pace     = _compute_pace(lap_data)
    deg      = _compute_degradation(lap_data)
    strategy = _compute_strategy(lap_data)

    features = pace.merge(deg, on=["season", "round", "driver_code"], how="outer")
    features = features.merge(strategy, on=["season", "round", "driver_code"], how="outer")

    return features

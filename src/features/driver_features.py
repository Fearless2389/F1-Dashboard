"""
Phase 3 — Driver Feature Engineering

All rolling windows use shift(1) before the rolling call so the current
race is never included. This guarantees zero leakage.

Input:  aligned_race_dataset (DataFrame)
Output: same DataFrame with driver feature columns appended
"""

import numpy as np
import pandas as pd


def _rolling(series: pd.Series, window: int, func: str) -> pd.Series:
    """shift(1) → rolling → aggregate. Strict historical window."""
    shifted = series.shift(1)
    if func == "mean":
        return shifted.rolling(window, min_periods=1).mean()
    if func == "sum":
        return shifted.rolling(window, min_periods=1).sum()
    if func == "std":
        return shifted.rolling(window, min_periods=1).std()
    raise ValueError(f"Unknown func: {func}")


def add_driver_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds all driver-level features in place.
    Expects columns: driver_code, season, round, finish_position_clean,
                     is_dnf, points, circuit_id
    """
    df = df.copy()

    # Sort for correct temporal ordering
    df = df.sort_values(["driver_code", "season", "round"]).reset_index(drop=True)

    grp = df.groupby("driver_code", group_keys=False)

    # ── Rolling finish position ───────────────────────────────────────────────
    df["driver_avg_finish_L5"] = grp["finish_position_clean"].transform(
        lambda x: _rolling(x, 5, "mean")
    ).astype("float32")

    df["driver_avg_finish_L10"] = grp["finish_position_clean"].transform(
        lambda x: _rolling(x, 10, "mean")
    ).astype("float32")

    # ── DNF rate ─────────────────────────────────────────────────────────────
    df["driver_dnf_rate_L10"] = grp["is_dnf"].transform(
        lambda x: _rolling(x, 10, "mean")
    ).astype("float32")

    # ── Rolling points ────────────────────────────────────────────────────────
    df["driver_points_L5"] = grp["points"].transform(
        lambda x: _rolling(x, 5, "sum")
    ).astype("float32")

    # ── Race experience ───────────────────────────────────────────────────────
    # Number of race starts BEFORE this race
    df["driver_experience"] = (
        grp.cumcount()  # 0-indexed count within group
    ).astype("int16")

    # ── Circuit-specific historical average ───────────────────────────────────
    # Sort by circuit + time, compute expanding mean of prior visits, then
    # merge back using original index to avoid row order issues.
    circuit_sorted = df.sort_values(["driver_code", "circuit_id", "season", "round"])
    circuit_avg = (
        circuit_sorted
        .groupby(["driver_code", "circuit_id"])["finish_position_clean"]
        .transform(lambda x: x.shift(1).expanding().mean())
    )
    df["driver_circuit_avg_finish"] = circuit_avg.reindex(df.index).astype("float32")

    # Fill NaN circuit avg with overall avg (first visit to a circuit)
    df["driver_circuit_avg_finish"] = df["driver_circuit_avg_finish"].fillna(
        df["driver_avg_finish_L10"]
    )

    return df

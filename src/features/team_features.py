"""
Phase 3 — Team Feature Engineering

Team rolling stats are computed at the team level across both drivers.
Pit stop times are aggregated from lap_data.

Input:  aligned_race_dataset (DataFrame), lap_data (DataFrame)
Output: aligned dataset with team feature columns appended
"""

import numpy as np
import pandas as pd


def _team_rolling(series: pd.Series, window: int, func: str) -> pd.Series:
    shifted = series.shift(1)
    if func == "mean":
        return shifted.rolling(window, min_periods=1).mean()
    if func == "sum":
        return shifted.rolling(window, min_periods=1).sum()
    raise ValueError(func)


def _compute_pit_times(lap_data: pd.DataFrame) -> pd.DataFrame:
    """
    Compute average pit stop duration per (season, round, team).
    A pit stop lap has both pit_in_time and pit_out_time populated.
    Duration proxy = tyre_life on first lap of each new stint (not exact,
    but avoids needing raw pit lane timing which isn't always reliable).

    FastF1 doesn't expose clean pit delta directly, so we use the gap
    between successive pit_out laps — approximated as below.
    """
    if lap_data is None or lap_data.empty:
        return pd.DataFrame(columns=["season", "round", "team_name", "team_avg_pit_time_ms"])

    # A pit stop occurred on laps where pit_in_time is not null
    pit_laps = lap_data[lap_data["pit_in_time"].notna()].copy()

    if pit_laps.empty:
        return pd.DataFrame(columns=["season", "round", "team_name", "team_avg_pit_time_ms"])

    # pit_in_time and pit_out_time are already in ms (converted in fetch_laps)
    pit_laps["pit_duration_ms"] = pit_laps["pit_out_time"] - pit_laps["pit_in_time"]

    # Keep only plausible durations (2–60 seconds)
    pit_laps = pit_laps[
        pit_laps["pit_duration_ms"].between(2_000, 60_000)
    ]

    # lap_data doesn't have team_name — we'll merge that in build_features
    # For now return per (season, round, driver_code)
    pit_avg = (
        pit_laps.groupby(["season", "round", "driver_code"])["pit_duration_ms"]
        .mean()
        .reset_index()
        .rename(columns={"pit_duration_ms": "avg_pit_time_ms"})
    )
    return pit_avg


def add_team_features(df: pd.DataFrame, lap_data: pd.DataFrame = None) -> pd.DataFrame:
    """
    Adds team-level rolling features.
    Team stats are computed across ALL drivers in a team for that race,
    then assigned back to each individual row.
    """
    df = df.copy()

    # ── Per-race team aggregates ──────────────────────────────────────────────
    # Average finishing position per team per race (across both drivers)
    team_race_avg = (
        df.groupby(["season", "round", "team_name"])["finish_position_clean"]
        .mean()
        .reset_index()
        .rename(columns={"finish_position_clean": "_team_race_avg_finish"})
    )
    team_race_dnf = (
        df.groupby(["season", "round", "team_name"])["is_dnf"]
        .mean()
        .reset_index()
        .rename(columns={"is_dnf": "_team_race_dnf_rate"})
    )
    team_race_pts = (
        df.groupby(["season", "round", "team_name"])["points"]
        .sum()
        .reset_index()
        .rename(columns={"points": "_team_race_points"})
    )

    # Merge team race aggregates onto main df temporarily
    df = df.merge(team_race_avg, on=["season", "round", "team_name"], how="left")
    df = df.merge(team_race_dnf, on=["season", "round", "team_name"], how="left")
    df = df.merge(team_race_pts, on=["season", "round", "team_name"], how="left")

    # ── Rolling team stats ────────────────────────────────────────────────────
    # Deduplicate to one row per (team, race) for rolling, then merge back
    team_time = (
        df[["team_name", "season", "round",
            "_team_race_avg_finish", "_team_race_dnf_rate", "_team_race_points"]]
        .drop_duplicates(subset=["team_name", "season", "round"])
        .sort_values(["team_name", "season", "round"])
    )

    team_grp = team_time.groupby("team_name", group_keys=False)

    team_time["team_avg_finish_L5"] = team_grp["_team_race_avg_finish"].transform(
        lambda x: _team_rolling(x, 5, "mean")
    ).astype("float32")

    team_time["team_dnf_rate_L10"] = team_grp["_team_race_dnf_rate"].transform(
        lambda x: _team_rolling(x, 10, "mean")
    ).astype("float32")

    team_time["team_points_L5"] = team_grp["_team_race_points"].transform(
        lambda x: _team_rolling(x, 5, "sum")
    ).astype("float32")

    team_features = team_time[
        ["team_name", "season", "round",
         "team_avg_finish_L5", "team_dnf_rate_L10", "team_points_L5"]
    ]

    # Drop the temp columns before merging final features
    df = df.drop(columns=["_team_race_avg_finish", "_team_race_dnf_rate", "_team_race_points"])
    df = df.merge(team_features, on=["team_name", "season", "round"], how="left")

    # ── Pit stop times ────────────────────────────────────────────────────────
    if lap_data is not None and not lap_data.empty:
        pit_avg = _compute_pit_times(lap_data)

        # Merge team name from aligned df onto pit data
        driver_team_map = df[["season", "round", "driver_code", "team_name"]].drop_duplicates()
        pit_avg = pit_avg.merge(driver_team_map, on=["season", "round", "driver_code"], how="left")

        team_pit = (
            pit_avg.groupby(["season", "round", "team_name"])["avg_pit_time_ms"]
            .mean()
            .reset_index()
            .rename(columns={"avg_pit_time_ms": "team_avg_pit_time_ms"})
        )
        df = df.merge(team_pit, on=["season", "round", "team_name"], how="left")
    else:
        df["team_avg_pit_time_ms"] = np.nan

    df["team_avg_pit_time_ms"] = df["team_avg_pit_time_ms"].astype("float64")

    return df

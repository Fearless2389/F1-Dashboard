"""
Per-race normalisation — z-score quali times and rolling form against each race's field.

Robust to grid-strength shifts (e.g. 2026 regulation reset).
Designed to be invoked from build_features.py.
"""

import pandas as pd


def _zscore(s: pd.Series) -> pd.Series:
    std = s.std()
    if std == 0 or pd.isna(std):
        return pd.Series([0.0] * len(s), index=s.index)
    return (s - s.mean()) / std


def add_per_race_zscores(df: pd.DataFrame,
                          cols: list[str] | None = None) -> pd.DataFrame:
    """
    For each (season, round), z-score the requested columns and append
    a `_zr` suffix column. Operates in-place on a copy.
    """
    df = df.copy()
    if cols is None:
        cols = [c for c in [
            "quali_gap_to_pole_ms",
            "driver_avg_finish_L5",
            "team_avg_finish_L5",
        ] if c in df.columns]

    if not cols:
        return df

    grouped = df.groupby(["season", "round"], group_keys=False)
    for col in cols:
        df[f"{col}_zr"] = grouped[col].transform(_zscore).astype("float32")
    return df

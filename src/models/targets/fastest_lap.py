"""
Fastest lap — LightGBM regressor on lap time as a percentage of pole.

We use median_clean_lap_ms (in-race feature) where present and fall back
to driver_avg_finish as a coarse proxy. Re-rank predicted times → probability
of holding the fastest lap.
"""

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

from ..config import PRE_RACE_FEATURES
from .base import Target


def _label(df: pd.DataFrame) -> pd.Series:
    """
    Build a soft fastest-lap label:
        if `median_clean_lap_ms` available → percentile within race (low = fast)
        else uses driver finish position as a coarse proxy
    """
    if "median_clean_lap_ms" in df.columns:
        med = df["median_clean_lap_ms"]
        # Per-race rank (1 = fastest median lap)
        ranks = df.assign(_med=med).groupby(["season", "round"])["_med"].rank(method="min")
        return ranks.astype("float32")
    return df["finish_position_clean"].astype("float32")


def _factory():
    return LGBMRegressor(
        n_estimators=400,
        learning_rate=0.05,
        max_depth=5,
        num_leaves=31,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )


target = Target(
    name="fastest_lap",
    kind="regression",
    output_filename="lgbm_fastest_lap.pkl",
    label_fn=_label,
    features=PRE_RACE_FEATURES,
    model_factory=_factory,
    eval_metric_name="rmse",
)

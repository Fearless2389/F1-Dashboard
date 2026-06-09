"""
Qualifying — predict the starting grid from pre-quali signals
(driver/team form, circuit history, practice pace where available).

Two-stage:
  Stage 1: regress predicted quali_position (continuous)
  Stage 2: per-race rank → integer grid order
"""

import pandas as pd
from lightgbm import LGBMRegressor

from ..config import PRE_RACE_FEATURES
from .base import Target


def _label(df: pd.DataFrame) -> pd.Series:
    return df["quali_position"].astype("float32")


# We do NOT use quali_position or quali_gap_to_pole_ms as features (target leakage)
_QUALI_FEATURES = [f for f in PRE_RACE_FEATURES
                   if f not in {"quali_position", "quali_gap_to_pole_ms",
                                "quali_position_vs_team"}]


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
    name="quali",
    kind="regression",
    output_filename="lgbm_quali.pkl",
    label_fn=_label,
    features=_QUALI_FEATURES,
    model_factory=_factory,
    eval_metric_name="rmse",
)

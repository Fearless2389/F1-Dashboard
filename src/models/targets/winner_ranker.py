"""
Winner — LightGBM LGBMRanker with per-race groups.

Label: 21 - finish_position (higher = better; pos 1 → 20, pos 20 → 1, DNF → 0).
Per-race softmax of model scores gives win probabilities that sum to 1.
"""

import pandas as pd
from lightgbm import LGBMRanker

from ..config import PRE_RACE_FEATURES
from .base import Target


def _label(df: pd.DataFrame) -> pd.Series:
    return (21 - df["finish_position_clean"]).clip(lower=0).astype("int8")


def _factory():
    return LGBMRanker(
        n_estimators=500,
        learning_rate=0.05,
        max_depth=5,
        num_leaves=31,
        min_child_samples=10,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )


target = Target(
    name="winner",
    kind="ranker",
    output_filename="lgbm_winner.pkl",
    label_fn=_label,
    features=PRE_RACE_FEATURES,
    model_factory=_factory,
    eval_metric_name="ndcg@1",
    extra={"group_by": ["season", "round"]},
)

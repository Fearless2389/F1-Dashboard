"""Podium (top-3) — binary classifier."""

import pandas as pd
from xgboost import XGBClassifier

from ..config import PRE_RACE_FEATURES, XGB_PARAMS
from .base import Target


def _label(df: pd.DataFrame) -> pd.Series:
    return (df["finish_position_clean"] <= 3).astype("int8")


def _factory():
    params = {k: v for k, v in XGB_PARAMS.items() if k != "early_stopping_rounds"}
    # Podium is rarer — boost class weight
    params["scale_pos_weight"] = 5.0
    return XGBClassifier(
        **params,
        early_stopping_rounds=XGB_PARAMS["early_stopping_rounds"],
    )


target = Target(
    name="podium",
    kind="binary",
    output_filename="xgb_podium.pkl",
    label_fn=_label,
    features=PRE_RACE_FEATURES,
    model_factory=_factory,
    eval_metric_name="roc_auc",
)

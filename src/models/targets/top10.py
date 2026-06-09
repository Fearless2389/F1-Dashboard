"""Top-10 finish — binary classifier (refactor of the existing model)."""

import pandas as pd
from xgboost import XGBClassifier

from ..config import PRE_RACE_FEATURES, XGB_PARAMS
from .base import Target


def _label(df: pd.DataFrame) -> pd.Series:
    return (df["finish_position_clean"] <= 10).astype("int8")


def _factory():
    params = {k: v for k, v in XGB_PARAMS.items() if k != "early_stopping_rounds"}
    return XGBClassifier(
        **params,
        early_stopping_rounds=XGB_PARAMS["early_stopping_rounds"],
    )


target = Target(
    name="top10",
    kind="binary",
    output_filename="xgb_top10.pkl",
    label_fn=_label,
    features=PRE_RACE_FEATURES,
    model_factory=_factory,
    eval_metric_name="roc_auc",
)

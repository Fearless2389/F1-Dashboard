"""Target dataclass — the contract every prediction target conforms to."""

from dataclasses import dataclass, field
from typing import Any, Callable

import pandas as pd


@dataclass
class Target:
    name: str
    kind: str                  # "binary" | "regression" | "ranker"
    output_filename: str       # e.g. "xgb_podium.pkl"
    label_fn: Callable[[pd.DataFrame], pd.Series]
    features: list[str]
    model_factory: Callable[[], Any]
    eval_metric_name: str
    extra: dict = field(default_factory=dict)

from typing import Optional
from pydantic import BaseModel


class TargetMetrics(BaseModel):
    target: str
    kind: str
    train_rows: Optional[int] = None
    val_metric: Optional[float] = None
    val_metric_name: Optional[str] = None
    test_metric: Optional[float] = None
    train_date: Optional[str] = None
    n_features: Optional[int] = None


class ModelManifest(BaseModel):
    generated_at: str
    targets: list[TargetMetrics]
    # Season splits are sourced from src/ingestion/config.py so the Models
    # page always shows the *actual* train/val/test split rather than a
    # docstring that goes stale every time the split is changed.
    train_seasons: list[int] = []
    val_seasons: list[int] = []
    test_seasons: list[int] = []

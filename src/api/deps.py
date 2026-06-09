"""Shared FastAPI dependencies — cached loaders for the feature matrix and models."""

import json
import logging
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd

from ..ingestion.config import DATA_PROCESSED, ROOT

log = logging.getLogger(__name__)

MODELS_DIR     = ROOT / "models" / "trained"
FEATURE_MATRIX = DATA_PROCESSED / "final_feature_matrix.parquet"
ALIGNED_FILE   = DATA_PROCESSED / "aligned_race_dataset.parquet"
MANIFEST_FILE  = MODELS_DIR / "manifest.json"


@lru_cache(maxsize=1)
def get_feature_matrix() -> Optional[pd.DataFrame]:
    if not FEATURE_MATRIX.exists():
        log.warning("Feature matrix not found at %s", FEATURE_MATRIX)
        return None
    return pd.read_parquet(FEATURE_MATRIX)


@lru_cache(maxsize=1)
def get_aligned_dataset() -> Optional[pd.DataFrame]:
    if not ALIGNED_FILE.exists():
        return None
    return pd.read_parquet(ALIGNED_FILE)


@lru_cache(maxsize=16)
def load_model(name: str) -> Optional[dict]:
    path = MODELS_DIR / name
    if not path.exists():
        log.warning("Model not found: %s", path)
        return None
    with open(path, "rb") as f:
        return pickle.load(f)


@lru_cache(maxsize=1)
def get_manifest() -> dict:
    if not MANIFEST_FILE.exists():
        return {"generated_at": "", "targets": []}
    try:
        return json.loads(MANIFEST_FILE.read_text())
    except Exception as exc:
        log.warning("Manifest read failed: %s", exc)
        return {"generated_at": "", "targets": []}


def reset_caches() -> None:
    get_feature_matrix.cache_clear()
    get_aligned_dataset.cache_clear()
    load_model.cache_clear()
    get_manifest.cache_clear()

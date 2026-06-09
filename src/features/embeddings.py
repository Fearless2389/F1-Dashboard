"""
Lightweight driver / team embeddings via TruncatedSVD.

Build an embedding once per season from the (driver/team × circuit) matrix
of finish positions. Cached to data/processed/embeddings.parquet so the
feature builder can join it like any other rolling stat.

Doesn't require torch or gensim — uses sklearn's TruncatedSVD only.
"""

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.decomposition import TruncatedSVD

from ..ingestion.config import DATA_PROCESSED

log = logging.getLogger(__name__)

EMBEDDINGS_FILE = DATA_PROCESSED / "embeddings.parquet"


def _build_one(df: pd.DataFrame, entity_col: str, dim: int) -> pd.DataFrame:
    """Build a (entity × circuit) matrix → SVD → dim-d embedding."""
    if entity_col not in df.columns or "circuit_id" not in df.columns:
        return pd.DataFrame()

    # Mean finish per entity × circuit
    pivot = (
        df.groupby([entity_col, "circuit_id"])["finish_position_clean"]
        .mean()
        .unstack(fill_value=10.0)   # neutral default = mid-pack
    )

    if pivot.empty or pivot.shape[1] < 2:
        return pd.DataFrame()

    n_components = min(dim, min(pivot.shape) - 1)
    if n_components <= 0:
        return pd.DataFrame()

    svd = TruncatedSVD(n_components=n_components, random_state=42)
    emb = svd.fit_transform(pivot.values)

    cols = [f"{entity_col}_emb_{i}" for i in range(n_components)]
    out = pd.DataFrame(emb, columns=cols, index=pivot.index).reset_index()
    return out


def build_embeddings(df: pd.DataFrame, dim: int = 8) -> pd.DataFrame:
    """
    Build per-season driver + team embeddings, stacked.

    Returns a long-form DataFrame keyed by (season, driver_code, team_name)
    with embedding columns appended. Cached to disk.
    """
    if df.empty:
        return pd.DataFrame()

    parts = []
    for season in sorted(df["season"].unique()):
        sub = df[df["season"] <= season]   # uses cumulative history up to season
        driver_emb = _build_one(sub, "driver_code", dim)
        team_emb = _build_one(sub, "team_name", dim)
        if driver_emb.empty and team_emb.empty:
            continue
        base = sub[sub["season"] == season][["season", "driver_code", "team_name"]].drop_duplicates()
        if not driver_emb.empty:
            base = base.merge(driver_emb, on="driver_code", how="left")
        if not team_emb.empty:
            base = base.merge(team_emb, on="team_name", how="left")
        parts.append(base)

    if not parts:
        return pd.DataFrame()

    out = pd.concat(parts, ignore_index=True)
    out.to_parquet(EMBEDDINGS_FILE, index=False)
    log.info("Embeddings saved → %s (%d rows, %d cols)",
             EMBEDDINGS_FILE, len(out), out.shape[1] - 3)
    return out


def load_embeddings() -> Optional[pd.DataFrame]:
    if not EMBEDDINGS_FILE.exists():
        return None
    return pd.read_parquet(EMBEDDINGS_FILE)

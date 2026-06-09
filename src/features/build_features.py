"""
Phase 3 — Feature Matrix Builder (Orchestrator)

Loads cleaned data, runs all feature modules, merges everything,
and saves the final feature matrix.

Inputs:
    data/processed/aligned_race_dataset.parquet
    data/raw/lap_data.parquet  (optional — pace/strategy features)

Output:
    data/processed/final_feature_matrix.parquet

Usage:
    python -m src.features.build_features
    python -m src.features.build_features --no-lap-data   # skip pace features
"""

import argparse
import logging
import sys

import numpy as np
import pandas as pd

from ..ingestion.config import DATA_PROCESSED, LAP_DATA_FILE
from ..models.normalize import add_per_race_zscores
from .driver_features import add_driver_features
from .embeddings import build_embeddings
from .pace_features import compute_lap_features
from .practice_features import compute_practice_features
from .team_features import add_team_features

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

ALIGNED_FILE = DATA_PROCESSED / "aligned_race_dataset.parquet"
OUTPUT_FILE  = DATA_PROCESSED / "final_feature_matrix.parquet"


# ── Temporal features ─────────────────────────────────────────────────────────

def _add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """Season round number and season stage (early/mid/late thirds)."""
    df = df.copy()
    df["round_number"] = df["round"].astype("int8")

    rounds_per_season = df.groupby("season")["round"].transform("max")
    stage = (df["round"] / rounds_per_season * 3).clip(upper=3).astype(int) - 1
    df["season_stage"] = stage.clip(lower=0).astype("int8")  # 0=early, 1=mid, 2=late

    return df


# ── Intra-team qualifying delta ───────────────────────────────────────────────

def _add_quali_team_delta(df: pd.DataFrame) -> pd.DataFrame:
    """
    quali_position_vs_team: driver's quali position minus teammate's.
    Positive = driver qualified behind teammate.
    For teams with 3+ drivers (rare), uses the best teammate as reference.
    """
    if "quali_position" not in df.columns:
        return df

    df = df.copy()

    # Best teammate quali position in same race
    team_best = (
        df.groupby(["season", "round", "team_name"])["quali_position"]
        .transform("min")
    )
    df["quali_position_vs_team"] = (
        (df["quali_position"] - team_best).astype("Int8")
    )
    return df


# ── Validation ────────────────────────────────────────────────────────────────

def _validate(df: pd.DataFrame) -> None:
    log.info(f"  Shape:         {df.shape}")
    log.info(f"  Seasons:       {df['season'].min()}–{df['season'].max()}")
    log.info(f"  Races:         {df.groupby(['season','round']).ngroups}")

    feature_cols = [c for c in df.columns if c not in
                    ["season", "round", "race_name", "circuit_id",
                     "driver_code", "driver_number", "team_name", "top_10"]]
    null_pct = df[feature_cols].isnull().mean().sort_values(ascending=False)
    high_null = null_pct[null_pct > 0.3]
    if not high_null.empty:
        log.warning(f"  Features with >30% nulls:\n{high_null.to_string()}")
    else:
        log.info(f"  Features ({len(feature_cols)} total): no column >30% null")

    log.info(f"  Target balance: {df['top_10'].mean():.1%} top-10 (expect ~50%)")


# ── Main ──────────────────────────────────────────────────────────────────────

def build(use_lap_data: bool = True) -> pd.DataFrame:
    log.info("Phase 3 — Feature Engineering")

    # ── Load inputs ───────────────────────────────────────────────────────────
    if not ALIGNED_FILE.exists():
        log.error(f"Aligned dataset not found at {ALIGNED_FILE}. Run align.py first.")
        sys.exit(1)

    df = pd.read_parquet(ALIGNED_FILE)
    log.info(f"Loaded aligned dataset: {len(df):,} rows")

    lap_data = None
    if use_lap_data:
        if LAP_DATA_FILE.exists():
            lap_data = pd.read_parquet(LAP_DATA_FILE)
            log.info(f"Loaded lap data: {len(lap_data):,} laps")
        else:
            log.warning("lap_data.parquet not found — pace/strategy features will be NaN")

    # ── Feature modules ───────────────────────────────────────────────────────
    log.info("Computing driver features...")
    df = add_driver_features(df)

    log.info("Computing team features...")
    df = add_team_features(df, lap_data=lap_data)

    log.info("Computing temporal features...")
    df = _add_temporal_features(df)
    df = _add_quali_team_delta(df)

    if lap_data is not None:
        log.info("Computing pace & strategy features...")
        lap_features = compute_lap_features(lap_data)
        df = df.merge(lap_features, on=["season", "round", "driver_code"], how="left")
        log.info(f"  Merged pace/strategy features: {lap_features.shape[1]-3} new columns")

    # Optional practice features (no-op if practice_lap_data.parquet missing)
    practice = compute_practice_features()
    if not practice.empty:
        df = df.merge(practice, on=["season", "round", "driver_code"], how="left")
        log.info(f"  Merged practice features: {practice.shape[1]-3} new columns")

    # Per-race z-scores (robust to grid-strength shifts)
    log.info("Adding per-race z-score normalisations...")
    df = add_per_race_zscores(df)

    # Driver/team SVD embeddings
    log.info("Building driver/team embeddings...")
    try:
        emb = build_embeddings(df, dim=8)
        if not emb.empty:
            df = df.merge(emb, on=["season", "driver_code", "team_name"], how="left")
            log.info(f"  Merged embeddings: {emb.shape[1]-3} new columns")
    except Exception as exc:
        log.warning(f"  Embedding build failed (continuing): {exc}")

    # ── Final column order ────────────────────────────────────────────────────
    id_cols     = ["season", "round", "race_name", "circuit_id",
                   "driver_code", "driver_number", "team_name"]
    target      = ["top_10"]
    raw_cols    = ["grid_position", "finish_position", "finish_position_clean",
                   "finish_status", "is_dnf", "points", "laps_completed",
                   "race_time_ms"]
    quali_raw   = ["quali_position", "q1_time_ms", "q2_time_ms", "q3_time_ms",
                   "best_quali_time_ms", "quali_gap_to_pole_ms"]
    weather_raw = ["air_temp_mean", "track_temp_mean", "humidity_mean",
                   "wind_speed_mean", "rainfall"]

    # All engineered features = everything else
    fixed = set(id_cols + target + raw_cols + quali_raw + weather_raw)
    engineered = [c for c in df.columns if c not in fixed]

    # Re-order: ids → target → raw → engineered
    available = lambda cols: [c for c in cols if c in df.columns]
    final_order = (
        available(id_cols) + available(target) +
        available(raw_cols) + available(quali_raw) +
        available(weather_raw) + sorted(available(engineered))
    )
    df = df[final_order]

    # ── Save ──────────────────────────────────────────────────────────────────
    log.info("Validation:")
    _validate(df)

    df.to_parquet(OUTPUT_FILE, index=False)
    log.info(f"Saved → {OUTPUT_FILE}")

    return df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build final feature matrix")
    parser.add_argument(
        "--no-lap-data", action="store_true",
        help="Skip pace/strategy features (run without lap_data.parquet)"
    )
    args = parser.parse_args()
    build(use_lap_data=not args.no_lap_data)

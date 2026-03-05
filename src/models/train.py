"""
Phase 4 — Model Training

Trains two models with time-aware train/val/test splits:
  1. Logistic Regression baseline (qualifying position only)
  2. XGBoost (full feature set)

Saves artifacts to models/trained/.

Usage:
    python -m src.models.train
    python -m src.models.train --model xgb       # XGBoost only
    python -m src.models.train --model baseline  # Baseline only
"""

import argparse
import logging
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from ..ingestion.config import DATA_PROCESSED
from .config import (
    ALL_FEATURES,
    LOGISTIC_PARAMS,
    PRE_RACE_FEATURES,
    SPLIT,
    TARGET,
    XGB_PARAMS,
)
from .evaluate import calibration_data, evaluate, print_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

FEATURE_MATRIX = DATA_PROCESSED / "final_feature_matrix.parquet"
MODELS_DIR     = Path(__file__).resolve().parents[2] / "models" / "trained"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


# ── Data loading & splitting ──────────────────────────────────────────────────

def load_splits(feature_list: list[str]) -> dict:
    """
    Load feature matrix and split strictly by season.
    Returns dict with keys train/val/test, each containing X, y, race_id.
    """
    if not FEATURE_MATRIX.exists():
        log.error(f"Feature matrix not found at {FEATURE_MATRIX}. Run build_features.py first.")
        sys.exit(1)

    df = pd.read_parquet(FEATURE_MATRIX)
    log.info(f"Loaded feature matrix: {len(df):,} rows")

    # Check which requested features are actually present
    available = [f for f in feature_list if f in df.columns]
    missing   = [f for f in feature_list if f not in df.columns]
    if missing:
        log.warning(f"  Features not found (will be skipped): {missing}")

    # Race ID for Precision@10 grouping
    df["_race_id"] = df["season"].astype(str) + "_R" + df["round"].astype(str)

    splits = {}
    for name, seasons in SPLIT.items():
        mask = df["season"].isin(seasons)
        sub  = df[mask].copy()
        splits[name] = {
            "X":       sub[available].copy(),
            "y":       sub[TARGET].values,
            "race_id": sub["_race_id"],
            "meta":    sub[["season", "round", "driver_code", "team_name"]],
            "empty":   len(sub) == 0,
        }
        if len(sub) == 0:
            log.warning(f"  {name:5s}: 0 rows — seasons {seasons} not in data")
        else:
            log.info(f"  {name:5s}: {len(sub):,} rows  ({sub['season'].min()}–{sub['season'].max()})")

    # If val or test are empty (e.g. only 1 season fetched), fall back to
    # using the last 20% of training rounds as a proxy val set.
    if splits["val"]["empty"]:
        log.warning("  Val set is empty — using last 20% of train rounds as fallback val.")
        train_meta = splits["train"]["meta"].copy()
        all_rounds = train_meta.drop_duplicates(["season", "round"]).sort_values(["season", "round"])
        cutoff = int(len(all_rounds) * 0.8)
        val_rounds = set(
            zip(all_rounds.iloc[cutoff:]["season"], all_rounds.iloc[cutoff:]["round"])
        )
        train_mask = train_meta.apply(
            lambda r: (r["season"], r["round"]) not in val_rounds, axis=1
        )
        val_mask = ~train_mask

        original_train = splits["train"]
        for split_name, mask in [("train", train_mask), ("val", val_mask)]:
            splits[split_name] = {
                "X":       original_train["X"][mask.values].copy(),
                "y":       original_train["y"][mask.values],
                "race_id": original_train["race_id"][mask.values],
                "meta":    original_train["meta"][mask.values],
                "empty":   False,
            }
        log.info(f"  train (trimmed): {splits['train']['y'].size:,} rows")
        log.info(f"  val (fallback):  {splits['val']['y'].size:,} rows")

    if splits["test"]["empty"]:
        log.warning("  Test set is empty — test metrics will be skipped.")

    return splits, available


# ── Imputation ────────────────────────────────────────────────────────────────

def _median_impute(X_train: pd.DataFrame, X_others: list[pd.DataFrame]):
    """Fit imputer on train, transform all splits. Skips empty DataFrames."""
    imp = SimpleImputer(strategy="median")
    X_train_imp = pd.DataFrame(imp.fit_transform(X_train), columns=X_train.columns)
    X_others_imp = [
        pd.DataFrame(imp.transform(X), columns=X.columns) if len(X) > 0
        else X.copy()
        for X in X_others
    ]
    return X_train_imp, X_others_imp, imp


# ── Baseline: Logistic Regression ────────────────────────────────────────────

def train_baseline(splits: dict, features: list[str]) -> dict:
    """
    Logistic Regression on qualifying position only (single feature baseline).
    Demonstrates the simplest possible model as benchmark.
    """
    log.info("\n── Baseline: Logistic Regression (quali_position only) ──")

    baseline_feat = ["quali_position"] if "quali_position" in features else features[:1]
    log.info(f"  Features: {baseline_feat}")

    X_tr = splits["train"]["X"][baseline_feat]
    X_vl = splits["val"]["X"][baseline_feat]
    X_te = splits["test"]["X"][baseline_feat]

    X_tr_imp, [X_vl_imp, X_te_imp], imp = _median_impute(X_tr, [X_vl, X_te])

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf",    LogisticRegression(**LOGISTIC_PARAMS)),
    ])
    pipe.fit(X_tr_imp, splits["train"]["y"])

    results = {}
    for name, X_imp, split in [
        ("train", X_tr_imp, "train"),
        ("val",   X_vl_imp, "val"),
        ("test",  X_te_imp, "test"),
    ]:
        if splits[split]["empty"] or len(X_imp) == 0:
            log.warning(f"  Skipping {name} evaluation — no data")
            continue
        prob = pipe.predict_proba(X_imp)[:, 1]
        results[name] = evaluate(
            splits[split]["y"], prob,
            race_ids=splits[split]["race_id"],
            label=f"baseline/{name}",
        )

    print_summary(results)

    # Save
    artifact = {"model": pipe, "imputer": imp, "features": baseline_feat, "type": "baseline"}
    path = MODELS_DIR / "logistic_baseline.pkl"
    with open(path, "wb") as f:
        pickle.dump(artifact, f)
    log.info(f"  Saved → {path}")

    return results


# ── XGBoost ───────────────────────────────────────────────────────────────────

def train_xgb(splits: dict, features: list[str]) -> dict:
    """XGBoost on full feature set with early stopping on validation AUC."""
    log.info("\n── XGBoost (full feature set) ──")
    log.info(f"  Features: {len(features)}")

    X_tr = splits["train"]["X"][features]
    X_vl = splits["val"]["X"][features]
    X_te = splits["test"]["X"][features]

    X_tr_imp, [X_vl_imp, X_te_imp], imp = _median_impute(X_tr, [X_vl, X_te])

    params = {k: v for k, v in XGB_PARAMS.items()
              if k != "early_stopping_rounds"}

    model = XGBClassifier(
        **params,
        early_stopping_rounds=XGB_PARAMS["early_stopping_rounds"],
    )
    model.fit(
        X_tr_imp, splits["train"]["y"],
        eval_set=[(X_vl_imp, splits["val"]["y"])],
        verbose=50,
    )
    log.info(f"  Best iteration: {model.best_iteration}")

    results = {}
    for name, X_imp, split in [
        ("train", X_tr_imp, "train"),
        ("val",   X_vl_imp, "val"),
        ("test",  X_te_imp, "test"),
    ]:
        if splits[split]["empty"] or len(X_imp) == 0:
            log.warning(f"  Skipping {name} evaluation — no data")
            continue
        prob = model.predict_proba(X_imp)[:, 1]
        results[name] = evaluate(
            splits[split]["y"], prob,
            race_ids=splits[split]["race_id"],
            label=f"xgb/{name}",
        )

    print_summary(results)

    # Feature importance table
    importance = pd.Series(
        model.feature_importances_, index=features
    ).sort_values(ascending=False)
    log.info("\n  Top-15 features by gain:")
    log.info(importance.head(15).to_string())

    # Calibration data (val set, or train as fallback)
    cal_source = X_vl_imp if not splits["val"]["empty"] and len(X_vl_imp) > 0 else X_tr_imp
    cal_y      = splits["val"]["y"] if not splits["val"]["empty"] and len(X_vl_imp) > 0 else splits["train"]["y"]
    val_prob   = model.predict_proba(cal_source)[:, 1]
    cal_df     = calibration_data(cal_y, val_prob)

    # Save
    artifact = {
        "model": model,
        "imputer": imp,
        "features": features,
        "importance": importance,
        "calibration": cal_df,
        "best_iteration": model.best_iteration,
        "type": "xgb",
    }
    path = MODELS_DIR / "xgb_top10.pkl"
    with open(path, "wb") as f:
        pickle.dump(artifact, f)
    log.info(f"  Saved → {path}")

    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def run(model_choice: str = "both") -> None:
    log.info("Phase 4 — Model Training")

    splits, features = load_splits(ALL_FEATURES)

    if model_choice in ("both", "baseline"):
        train_baseline(splits, features)

    if model_choice in ("both", "xgb"):
        train_xgb(splits, features)

    log.info("\nDone. Models saved to models/trained/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train F1 top-10 prediction models")
    parser.add_argument(
        "--model", choices=["both", "baseline", "xgb"], default="both",
        help="Which model(s) to train"
    )
    args = parser.parse_args()
    run(model_choice=args.model)

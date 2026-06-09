"""
Phase 4 — Multi-target Model Training

Trains one or more prediction targets from the target registry:
    top10, podium, winner, dnf, fastest_lap, quali

Each target produces:
    models/trained/<target.output_filename>   (pickled artifact)
    models/trained/manifest.json              (target → metrics summary)

Usage:
    python -m src.models.train
    python -m src.models.train --targets top10,podium,winner
    python -m src.models.train --targets all
"""

import argparse
import json
import logging
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import mean_squared_error, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..ingestion.config import DATA_PROCESSED
from .config import ALL_FEATURES, LOGISTIC_PARAMS, SPLIT, TARGET
from .targets import REGISTRY as TARGET_REGISTRY
from .targets.base import Target
from .uncertainty import fit_conformal

try:
    from .evaluate import calibration_data, evaluate, print_summary
except Exception:
    calibration_data = None
    evaluate = None
    print_summary = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

FEATURE_MATRIX = DATA_PROCESSED / "final_feature_matrix.parquet"
MODELS_DIR     = Path(__file__).resolve().parents[2] / "models" / "trained"
MANIFEST_FILE  = MODELS_DIR / "manifest.json"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


# ── Split loading ─────────────────────────────────────────────────────────────

def load_splits_for_target(target: Target, df: pd.DataFrame) -> dict:
    """Build per-split X/y/groups for a single target."""
    available = [f for f in target.features if f in df.columns]
    missing = [f for f in target.features if f not in df.columns]
    if missing:
        log.warning("[%s] features not in matrix (skipped): %s", target.name, missing)

    df = df.copy()
    df["_label"] = target.label_fn(df)
    df["_race_id"] = df["season"].astype(str) + "_R" + df["round"].astype(str)

    splits = {}
    for name, seasons in SPLIT.items():
        sub = df[df["season"].isin(seasons)].copy()
        if sub.empty:
            splits[name] = {"empty": True, "X": pd.DataFrame(), "y": np.array([]),
                            "race_id": pd.Series(dtype=str), "meta": pd.DataFrame(),
                            "groups": np.array([])}
            continue

        # Drop rows with NaN labels (e.g. quali target on sprint weekends)
        valid = sub["_label"].notna()
        sub = sub[valid]
        if sub.empty:
            splits[name] = {"empty": True, "X": pd.DataFrame(), "y": np.array([]),
                            "race_id": pd.Series(dtype=str), "meta": pd.DataFrame(),
                            "groups": np.array([])}
            continue

        # For rankers we need per-race group sizes
        groups = (
            sub.groupby(["season", "round"]).size().values
            if target.kind == "ranker"
            else np.array([])
        )

        splits[name] = {
            "empty":   False,
            "X":       sub[available].copy(),
            "y":       sub["_label"].astype(float).values,
            "race_id": sub["_race_id"],
            "meta":    sub[["season", "round", "driver_code", "team_name"]],
            "groups":  groups,
        }

    return splits, available


def _median_impute(X_train: pd.DataFrame, X_others: list[pd.DataFrame]):
    imp = SimpleImputer(strategy="median", keep_empty_features=True)
    X_train_imp = pd.DataFrame(imp.fit_transform(X_train), columns=X_train.columns)
    X_others_imp = [
        pd.DataFrame(imp.transform(X), columns=X.columns) if len(X) > 0
        else X.copy()
        for X in X_others
    ]
    return X_train_imp, X_others_imp, imp


# ── Per-target trainer ────────────────────────────────────────────────────────

def train_target(target: Target, df: pd.DataFrame) -> dict:
    log.info("\n── %s (%s) ──", target.name, target.kind)

    splits, features = load_splits_for_target(target, df)
    if splits["train"]["empty"]:
        log.error("[%s] empty train split — skipping", target.name)
        return {"target": target.name, "status": "skipped_empty_train"}

    X_tr = splits["train"]["X"]
    X_vl = splits["val"]["X"]
    X_te = splits["test"]["X"]

    X_tr_imp, [X_vl_imp, X_te_imp], imp = _median_impute(X_tr, [X_vl, X_te])

    model = target.model_factory()

    fit_kwargs: dict = {}
    if target.kind == "ranker":
        fit_kwargs["group"] = splits["train"]["groups"]
        if not splits["val"]["empty"]:
            fit_kwargs["eval_set"] = [(X_vl_imp, splits["val"]["y"])]
            fit_kwargs["eval_group"] = [splits["val"]["groups"]]
        model.fit(X_tr_imp, splits["train"]["y"], **fit_kwargs)
    elif target.kind == "binary" and hasattr(model, "fit") and not splits["val"]["empty"]:
        # XGBoost early stopping
        try:
            model.fit(
                X_tr_imp, splits["train"]["y"],
                eval_set=[(X_vl_imp, splits["val"]["y"])],
                verbose=False,
            )
        except TypeError:
            model.fit(X_tr_imp, splits["train"]["y"])
    else:
        model.fit(X_tr_imp, splits["train"]["y"])

    # ── Metrics ───────────────────────────────────────────────────────────────
    metrics = {}
    for name, X_imp in [("train", X_tr_imp), ("val", X_vl_imp), ("test", X_te_imp)]:
        if splits[name]["empty"] or len(X_imp) == 0:
            continue
        y = splits[name]["y"]
        if target.kind == "binary":
            prob = model.predict_proba(X_imp)[:, 1]
            try:
                metrics[name] = float(roc_auc_score(y, prob))
            except Exception:
                metrics[name] = None
        elif target.kind == "regression":
            pred = model.predict(X_imp)
            metrics[name] = float(np.sqrt(mean_squared_error(y, pred)))
        elif target.kind == "ranker":
            raw = model.predict(X_imp)
            # NDCG@1 — fraction of races where top-predicted is also top-actual
            meta = splits[name]["meta"].copy()
            meta["_score"] = raw
            meta["_y"] = y
            hits = 0
            races = 0
            for _, g in meta.groupby(["season", "round"]):
                if g.empty:
                    continue
                pred_top = g["_score"].idxmax()
                actual_top = g["_y"].idxmax()
                if pred_top == actual_top:
                    hits += 1
                races += 1
            metrics[name] = float(hits / races) if races else None

    log.info("  Metrics: %s", metrics)

    # ── Feature importance ──────────────────────────────────────────────────────
    importance = None
    if hasattr(model, "feature_importances_"):
        importance = pd.Series(
            model.feature_importances_, index=features
        ).sort_values(ascending=False)

    # ── Calibration data + conformal (binary only) ──────────────────────────────
    calibration = None
    conformal = None
    if target.kind == "binary" and not splits["val"]["empty"]:
        val_prob = model.predict_proba(X_vl_imp)[:, 1]
        if calibration_data is not None:
            try:
                calibration = calibration_data(splits["val"]["y"], val_prob)
            except Exception:
                pass
        try:
            conformal = fit_conformal(val_prob, splits["val"]["y"], alpha=0.1)
        except Exception:
            pass

    artifact = {
        "target":     target.name,
        "kind":       target.kind,
        "model":      model,
        "imputer":    imp,
        "features":   features,
        "importance": importance,
        "calibration": calibration,
        "conformal":  conformal,
        "metrics":    metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    path = MODELS_DIR / target.output_filename
    with open(path, "wb") as f:
        pickle.dump(artifact, f)
    log.info("  Saved → %s", path)

    return {
        "target":           target.name,
        "kind":             target.kind,
        "output_filename":  target.output_filename,
        "train_rows":       int(splits["train"]["X"].shape[0]),
        "n_features":       len(features),
        "val_metric":       metrics.get("val"),
        "test_metric":      metrics.get("test"),
        "val_metric_name":  target.eval_metric_name,
        "train_date":       artifact["trained_at"],
    }


# ── Baseline (kept for backwards compat) ──────────────────────────────────────

def train_baseline(df: pd.DataFrame) -> Optional[dict]:
    """Logistic regression baseline on quali_position only."""
    log.info("\n── Baseline: Logistic Regression (quali_position only) ──")
    df = df.copy()
    df["_label"] = (df["finish_position_clean"] <= 10).astype("int8")

    feat = "quali_position"
    if feat not in df.columns:
        log.warning("baseline skipped — no quali_position column")
        return None

    splits = {}
    for name, seasons in SPLIT.items():
        sub = df[df["season"].isin(seasons)]
        splits[name] = {
            "X": sub[[feat]].copy(),
            "y": sub["_label"].values,
            "empty": sub.empty,
        }

    if splits["train"]["empty"]:
        log.warning("baseline skipped — empty train split")
        return None

    X_tr_imp, [X_vl_imp, X_te_imp], imp = _median_impute(
        splits["train"]["X"], [splits["val"]["X"], splits["test"]["X"]],
    )
    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf",    LogisticRegression(**LOGISTIC_PARAMS)),
    ])
    pipe.fit(X_tr_imp, splits["train"]["y"])

    metrics = {}
    for name, X_imp in [("train", X_tr_imp), ("val", X_vl_imp), ("test", X_te_imp)]:
        if splits[name]["empty"] or len(X_imp) == 0:
            continue
        prob = pipe.predict_proba(X_imp)[:, 1]
        try:
            metrics[name] = float(roc_auc_score(splits[name]["y"], prob))
        except Exception:
            metrics[name] = None

    artifact = {
        "target": "top10_baseline",
        "kind":   "binary",
        "model":  pipe,
        "imputer": imp,
        "features": [feat],
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    path = MODELS_DIR / "logistic_baseline.pkl"
    with open(path, "wb") as f:
        pickle.dump(artifact, f)
    log.info("  Saved → %s", path)

    return {
        "target": "logistic_baseline",
        "kind": "binary",
        "output_filename": "logistic_baseline.pkl",
        "n_features": 1,
        "val_metric": metrics.get("val"),
        "test_metric": metrics.get("test"),
        "val_metric_name": "roc_auc",
        "train_date": artifact["trained_at"],
    }


# ── Manifest ──────────────────────────────────────────────────────────────────

def write_manifest(entries: list[dict]) -> None:
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "targets":      entries,
    }
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2, default=str))
    log.info("  Manifest → %s", MANIFEST_FILE)


# ── Main ──────────────────────────────────────────────────────────────────────

def run(targets: list[str], with_baseline: bool = True) -> None:
    if not FEATURE_MATRIX.exists():
        log.error("Feature matrix not found at %s. Run build_features.py first.", FEATURE_MATRIX)
        return

    df = pd.read_parquet(FEATURE_MATRIX)
    log.info("Loaded feature matrix: %d rows", len(df))

    entries: list[dict] = []

    if with_baseline:
        baseline = train_baseline(df)
        if baseline is not None:
            entries.append(baseline)

    for name in targets:
        if name not in TARGET_REGISTRY:
            log.error("Unknown target %s. Available: %s", name, list(TARGET_REGISTRY))
            continue
        try:
            entry = train_target(TARGET_REGISTRY[name], df)
            entries.append(entry)
        except Exception as exc:
            log.exception("Training %s failed: %s", name, exc)
            entries.append({"target": name, "status": "failed", "error": str(exc)})

    write_manifest(entries)
    log.info("\nDone.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-target F1 model trainer")
    parser.add_argument(
        "--targets", default="all",
        help="Comma-separated targets, or 'all'. Available: " + ",".join(TARGET_REGISTRY),
    )
    parser.add_argument("--no-baseline", action="store_true",
                        help="Skip the logistic regression baseline")
    # Backwards-compat for the old "--model" flag
    parser.add_argument("--model", choices=["both", "baseline", "xgb"], default=None)
    args = parser.parse_args()

    if args.model is not None:
        with_base = args.model in ("both", "baseline")
        targets_arg = ["top10"] if args.model in ("both", "xgb") else []
    else:
        with_base = not args.no_baseline
        if args.targets == "all":
            targets_arg = list(TARGET_REGISTRY)
        else:
            targets_arg = [t.strip() for t in args.targets.split(",") if t.strip()]

    run(targets=targets_arg, with_baseline=with_base)

"""
Phase 5 — Evaluation & Error Analysis

Loads the trained XGBoost model and runs a full diagnostic:
  1. Overall metrics (ROC-AUC, Brier, Precision@10) on val + test
  2. Error breakdown by circuit, driver tier, wet vs dry, season stage
  3. SHAP feature importance (global + top drivers)
  4. Calibration curve
  5. Saves all outputs to docs/analysis/

Usage:
    python -m src.models.analysis
    python -m src.models.analysis --split test   # analyse test set only
    python -m src.models.analysis --no-shap      # skip SHAP (faster)
"""

import argparse
import logging
import pickle
import warnings
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.calibration import calibration_curve
from sklearn.metrics import roc_auc_score, brier_score_loss

from ..ingestion.config import DATA_PROCESSED
from .config import SPLIT, TARGET
from .evaluate import evaluate, precision_at_k

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

MODELS_DIR  = Path(__file__).resolve().parents[2] / "models" / "trained"
ANALYSIS_DIR = Path(__file__).resolve().parents[2] / "docs" / "analysis"
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

FEATURE_MATRIX = DATA_PROCESSED / "final_feature_matrix.parquet"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_model(name: str = "xgb_top10.pkl") -> dict:
    path = MODELS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}. Run train.py first.")
    with open(path, "rb") as f:
        return pickle.load(f)


def _load_split(df: pd.DataFrame, split: str, features: list[str]) -> tuple:
    seasons = SPLIT[split]
    sub = df[df["season"].isin(seasons)].copy()
    sub["_race_id"] = sub["season"].astype(str) + "_R" + sub["round"].astype(str)

    available = [f for f in features if f in sub.columns]
    X = sub[available].copy()
    y = sub[TARGET].values
    return X, y, sub


def _predict(artifact: dict, X: pd.DataFrame) -> np.ndarray:
    X_imp = pd.DataFrame(
        artifact["imputer"].transform(X[artifact["features"]]),
        columns=artifact["features"],
        index=X.index,
    )
    return artifact["model"].predict_proba(X_imp)[:, 1]


# ── 1. Overall metrics ────────────────────────────────────────────────────────

def section_overall(artifact: dict, df: pd.DataFrame, splits: list[str]) -> None:
    log.info("\n══ 1. Overall Metrics ══════════════════════════════════")
    rows = []
    for split in splits:
        X, y, sub = _load_split(df, split, artifact["features"])
        prob = _predict(artifact, X)
        race_id = sub["_race_id"]
        m = evaluate(y, prob, race_ids=race_id, label=split)
        rows.append({"split": split, **m})

    summary = pd.DataFrame(rows).set_index("split")
    print(summary.round(4).to_string())
    summary.to_csv(ANALYSIS_DIR / "overall_metrics.csv")
    log.info(f"  Saved → docs/analysis/overall_metrics.csv")


# ── 2. Error breakdown ────────────────────────────────────────────────────────

def _auc_by_group(df_sub: pd.DataFrame, prob: np.ndarray, group_col: str) -> pd.DataFrame:
    df_sub = df_sub.copy()
    df_sub["_prob"] = prob
    rows = []
    for grp, gdf in df_sub.groupby(group_col):
        y_g = gdf[TARGET].values
        p_g = gdf["_prob"].values
        if y_g.sum() == 0 or y_g.sum() == len(y_g):
            continue  # can't compute AUC with one class
        try:
            auc = roc_auc_score(y_g, p_g)
            brier = brier_score_loss(y_g, p_g)
            rows.append({group_col: grp, "roc_auc": auc, "brier": brier, "n": len(gdf)})
        except Exception:
            pass
    return pd.DataFrame(rows).sort_values("roc_auc", ascending=False)


def _driver_tier(df_sub: pd.DataFrame) -> pd.DataFrame:
    """
    Bucket drivers into tiers based on their average historical finishing position.
    Tier 1 = top performers (avg finish ≤ 7), Tier 3 = backmarkers.
    """
    df_sub = df_sub.copy()
    avg_finish = df_sub.groupby("driver_code")["finish_position_clean"].mean()
    bins   = [0, 7, 13, 25]
    labels = ["Tier 1 (Top)", "Tier 2 (Mid)", "Tier 3 (Back)"]
    tier_map = pd.cut(avg_finish, bins=bins, labels=labels)
    df_sub["driver_tier"] = df_sub["driver_code"].map(tier_map)
    return df_sub


def section_breakdown(artifact: dict, df: pd.DataFrame, split: str = "val") -> None:
    log.info(f"\n══ 2. Error Breakdown ({split}) ═════════════════════════")
    X, y, sub = _load_split(df, split, artifact["features"])
    prob = _predict(artifact, X)

    sub = sub.copy()
    sub["_prob"] = prob
    sub = _driver_tier(sub)

    breakdowns = {
        "circuit":      ("circuit_id",   "By Circuit"),
        "driver_tier":  ("driver_tier",  "By Driver Tier"),
        "wet_race":     ("is_wet_race",  "Wet vs Dry"),
        "season_stage": ("season_stage", "By Season Stage"),
    }

    for key, (col, title) in breakdowns.items():
        if col not in sub.columns:
            # is_wet_race may not exist — derive from rainfall
            if col == "is_wet_race" and "rainfall" in sub.columns:
                sub["is_wet_race"] = sub["rainfall"].map({True: "Wet", False: "Dry", 1: "Wet", 0: "Dry"})
            else:
                log.warning(f"  Column '{col}' not found, skipping {title}")
                continue

        result = _auc_by_group(sub, prob, col)
        if result.empty:
            continue

        out_path = ANALYSIS_DIR / f"breakdown_{key}.csv"
        result.to_csv(out_path, index=False)
        log.info(f"\n  {title}:")
        log.info(result.round(4).to_string(index=False))
        log.info(f"  Saved → {out_path}")


# ── 3. SHAP ───────────────────────────────────────────────────────────────────

def section_shap(artifact: dict, df: pd.DataFrame, split: str = "val",
                 max_rows: int = 2000) -> None:
    log.info(f"\n══ 3. SHAP Analysis ({split}) ═══════════════════════════")

    X, y, sub = _load_split(df, split, artifact["features"])
    X_imp = pd.DataFrame(
        artifact["imputer"].transform(X[artifact["features"]]),
        columns=artifact["features"],
        index=X.index,
    )

    # Subsample for speed if large
    if len(X_imp) > max_rows:
        X_imp = X_imp.sample(max_rows, random_state=42)
        log.info(f"  Subsampled to {max_rows} rows for SHAP")

    explainer = shap.TreeExplainer(artifact["model"])
    shap_values = explainer.shap_values(X_imp)

    # ── Global bar chart ──────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(9, 7))
    shap.summary_plot(shap_values, X_imp, plot_type="bar",
                      max_display=15, show=False)
    plt.title("SHAP Feature Importance (mean |SHAP|)", fontsize=13)
    plt.tight_layout()
    path = ANALYSIS_DIR / "shap_importance.png"
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    log.info(f"  Saved → {path}")

    # ── Beeswarm plot ─────────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(9, 7))
    shap.summary_plot(shap_values, X_imp, max_display=15, show=False)
    plt.title("SHAP Beeswarm — Feature Impact on Top-10 Probability", fontsize=12)
    plt.tight_layout()
    path = ANALYSIS_DIR / "shap_beeswarm.png"
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    log.info(f"  Saved → {path}")

    # ── Save SHAP values as CSV ───────────────────────────────────────────────
    shap_df = pd.DataFrame(shap_values, columns=artifact["features"])
    mean_abs = shap_df.abs().mean().sort_values(ascending=False)
    mean_abs.to_csv(ANALYSIS_DIR / "shap_mean_abs.csv", header=["mean_abs_shap"])
    log.info(f"\n  Top-10 features by mean |SHAP|:")
    log.info(mean_abs.head(10).round(4).to_string())


# ── 4. Calibration ────────────────────────────────────────────────────────────

def section_calibration(artifact: dict, df: pd.DataFrame, split: str = "val") -> None:
    log.info(f"\n══ 4. Calibration ({split}) ══════════════════════════════")

    X, y, _ = _load_split(df, split, artifact["features"])
    prob = _predict(artifact, X)

    frac_pos, mean_pred = calibration_curve(y, prob, n_bins=10, strategy="uniform")

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot([0, 1], [0, 1], "k--", label="Perfect calibration", alpha=0.6)
    ax.plot(mean_pred, frac_pos, "o-", color="#e10600", label="XGBoost")
    ax.set_xlabel("Mean predicted probability")
    ax.set_ylabel("Fraction of positives (actual top-10 rate)")
    ax.set_title(f"Calibration Curve — {split} set")
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    path = ANALYSIS_DIR / f"calibration_{split}.png"
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    log.info(f"  Saved → {path}")

    cal_df = pd.DataFrame({"mean_predicted": mean_pred, "fraction_positive": frac_pos})
    cal_df.to_csv(ANALYSIS_DIR / f"calibration_{split}.csv", index=False)


# ── 5. Worst/best predictions ─────────────────────────────────────────────────

def section_examples(artifact: dict, df: pd.DataFrame, split: str = "val") -> None:
    log.info(f"\n══ 5. Prediction Examples ({split}) ══════════════════════")

    X, y, sub = _load_split(df, split, artifact["features"])
    prob = _predict(artifact, X)

    sub = sub.copy()
    sub["prob_top10"] = prob
    sub["actual_top10"] = y
    sub["error"] = (prob - y).abs()

    # False positives: predicted top-10 (prob > 0.6) but didn't finish there
    fp = sub[(sub["prob_top10"] > 0.6) & (sub["actual_top10"] == 0)]
    fp = fp[["season", "round", "race_name", "driver_code",
             "team_name", "prob_top10", "finish_position_clean"]].sort_values(
        "prob_top10", ascending=False
    ).head(15)

    # False negatives: actual top-10 but model missed (prob < 0.4)
    fn = sub[(sub["prob_top10"] < 0.4) & (sub["actual_top10"] == 1)]
    fn = fn[["season", "round", "race_name", "driver_code",
             "team_name", "prob_top10", "finish_position_clean"]].sort_values(
        "prob_top10"
    ).head(15)

    log.info("\n  Top false positives (high prob, didn't finish top-10):")
    log.info(fp.to_string(index=False))

    log.info("\n  Top false negatives (low prob, did finish top-10):")
    log.info(fn.to_string(index=False))

    fp.to_csv(ANALYSIS_DIR / "false_positives.csv", index=False)
    fn.to_csv(ANALYSIS_DIR / "false_negatives.csv", index=False)
    log.info(f"  Saved false_positives.csv and false_negatives.csv")


# ── Main ──────────────────────────────────────────────────────────────────────

def run(split: str = "val", run_shap: bool = True) -> None:
    log.info("Phase 5 — Evaluation & Analysis")

    artifact = _load_model("xgb_top10.pkl")
    df = pd.read_parquet(FEATURE_MATRIX)

    section_overall(artifact, df, splits=["train", "val", "test"])
    section_breakdown(artifact, df, split=split)
    if run_shap:
        section_shap(artifact, df, split=split)
    section_calibration(artifact, df, split=split)
    section_examples(artifact, df, split=split)

    log.info(f"\nAll outputs saved to docs/analysis/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="F1 model error analysis")
    parser.add_argument(
        "--split", choices=["val", "test"], default="val",
        help="Which split to analyse in detail (default: val)"
    )
    parser.add_argument(
        "--no-shap", action="store_true",
        help="Skip SHAP computation (faster)"
    )
    args = parser.parse_args()
    run(split=args.split, run_shap=not args.no_shap)

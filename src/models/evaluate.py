"""
Phase 4/5 — Evaluation

Metrics:
  - ROC-AUC
  - Precision@10  (per race: how many of top-10 predicted are actual top-10)
  - Brier Score
  - Calibration data

Usage: imported by train.py and used standalone in Phase 5 error analysis.
"""

import logging

import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import brier_score_loss, roc_auc_score

log = logging.getLogger(__name__)


def precision_at_k(
    y_true: pd.Series,
    y_prob: pd.Series,
    groups: pd.Series,
    k: int = 10,
) -> float:
    """
    Per-race Precision@K: for each race, take top-K predicted probabilities,
    count how many are actually top-10 finishers.
    Average across races.
    """
    scores = []
    for _, idx in groups.groupby(groups).groups.items():
        gt   = y_true.iloc[idx].values
        prob = y_prob.iloc[idx].values
        top_k_idx = np.argsort(prob)[::-1][:k]
        scores.append(gt[top_k_idx].sum() / k)
    return float(np.mean(scores))


def evaluate(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    race_ids: pd.Series = None,
    label: str = "",
) -> dict:
    """
    Compute all evaluation metrics. Returns a dict.
    race_ids: Series used to group by race for Precision@10.
    """
    results = {}

    results["roc_auc"] = roc_auc_score(y_true, y_prob)
    results["brier"]   = brier_score_loss(y_true, y_prob)

    if race_ids is not None:
        results["precision_at_10"] = precision_at_k(
            pd.Series(y_true), pd.Series(y_prob), race_ids
        )

    tag = f"[{label}] " if label else ""
    log.info(
        f"  {tag}ROC-AUC={results['roc_auc']:.4f}  "
        f"Brier={results['brier']:.4f}  "
        + (f"P@10={results.get('precision_at_10', 0):.4f}" if race_ids is not None else "")
    )

    return results


def calibration_data(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> pd.DataFrame:
    """Return calibration curve as a DataFrame for plotting."""
    frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
    return pd.DataFrame({"mean_predicted": mean_pred, "fraction_positive": frac_pos})


def print_summary(results_by_split: dict) -> None:
    """Pretty-print a comparison table across splits."""
    rows = []
    for split, metrics in results_by_split.items():
        rows.append({
            "Split":        split,
            "ROC-AUC":      f"{metrics.get('roc_auc', 0):.4f}",
            "Brier":        f"{metrics.get('brier', 0):.4f}",
            "Precision@10": f"{metrics.get('precision_at_10', 0):.4f}",
        })
    df = pd.DataFrame(rows).set_index("Split")
    print("\n" + df.to_string() + "\n")

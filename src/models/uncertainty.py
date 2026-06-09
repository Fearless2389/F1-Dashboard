"""
Split-conformal prediction for binary classifiers.

Produces a (lower, upper) interval per prediction at a chosen miscoverage
level (e.g. 0.1 → 90% coverage). Calibration uses a held-out validation set.

Reference: Vovk et al., "Algorithmic Learning in a Random World" (2005)
            Angelopoulos & Bates, "A Gentle Introduction to Conformal Prediction" (2021)
"""

from dataclasses import dataclass

import numpy as np


@dataclass
class ConformalCalibration:
    quantile: float        # The conformity score quantile
    alpha: float           # Miscoverage level used
    n_cal: int             # Calibration set size


def fit_conformal(cal_probs: np.ndarray,
                   cal_labels: np.ndarray,
                   alpha: float = 0.1) -> ConformalCalibration:
    """
    `cal_probs` — calibration-set predicted probabilities for the positive class.
    `cal_labels` — calibration-set true binary labels.
    `alpha` — miscoverage (1 - coverage). Default 0.1 → 90% intervals.
    """
    if len(cal_probs) != len(cal_labels):
        raise ValueError("cal_probs and cal_labels must have the same length")

    # Nonconformity score: |label - prob|
    scores = np.abs(cal_labels.astype(float) - np.clip(cal_probs, 1e-6, 1 - 1e-6))
    n = len(scores)
    q_level = np.ceil((n + 1) * (1 - alpha)) / n
    q_level = float(min(q_level, 1.0))
    q_hat = float(np.quantile(scores, q_level))

    return ConformalCalibration(quantile=q_hat, alpha=alpha, n_cal=n)


def predict_interval(probs: np.ndarray,
                      cal: ConformalCalibration) -> tuple[np.ndarray, np.ndarray]:
    """Return (lower, upper) probability bands for each prediction."""
    p = np.clip(probs, 0.0, 1.0)
    lo = np.clip(p - cal.quantile, 0.0, 1.0)
    hi = np.clip(p + cal.quantile, 0.0, 1.0)
    return lo, hi

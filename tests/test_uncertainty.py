"""Split-conformal prediction sanity."""

import numpy as np
import pytest

from src.models.uncertainty import fit_conformal, predict_interval


def test_interval_brackets_prediction():
    rng = np.random.default_rng(0)
    cal_probs = rng.beta(2, 5, size=200)
    cal_labels = (rng.random(200) < cal_probs).astype(int)

    cal = fit_conformal(cal_probs, cal_labels, alpha=0.1)
    assert 0 < cal.quantile < 1

    probs = np.array([0.05, 0.5, 0.95])
    lo, hi = predict_interval(probs, cal)
    assert (lo <= probs).all()
    assert (hi >= probs).all()
    assert (lo >= 0).all() and (hi <= 1).all()


def test_higher_alpha_narrower_intervals():
    rng = np.random.default_rng(0)
    cal_probs = rng.uniform(0, 1, size=500)
    cal_labels = (rng.random(500) < cal_probs).astype(int)

    cal_loose  = fit_conformal(cal_probs, cal_labels, alpha=0.3)
    cal_strict = fit_conformal(cal_probs, cal_labels, alpha=0.05)

    assert cal_strict.quantile >= cal_loose.quantile

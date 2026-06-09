"""Target registry — label functions produce the right shapes."""

import numpy as np
import pandas as pd
import pytest

from src.models.targets import REGISTRY, get


@pytest.fixture
def fixture_df() -> pd.DataFrame:
    n = 20
    return pd.DataFrame({
        "season":                np.repeat([2024], n),
        "round":                 np.repeat([1], n),
        "driver_code":           [f"D{i}" for i in range(n)],
        "team_name":             [f"T{i // 2}" for i in range(n)],
        "finish_position_clean": list(range(1, n + 1)),
        "is_dnf":                [0] * 18 + [1, 1],
        "quali_position":        list(range(1, n + 1)),
        "circuit_id":            ["bahrain"] * n,
        "median_clean_lap_ms":   [90_000 + i * 100 for i in range(n)],
    })


def test_registry_has_six_targets():
    assert set(REGISTRY) == {"top10", "podium", "winner", "dnf", "fastest_lap", "quali"}


def test_top10_label(fixture_df):
    y = get("top10").label_fn(fixture_df)
    assert y.sum() == 10  # finish positions 1..10


def test_podium_label(fixture_df):
    y = get("podium").label_fn(fixture_df)
    assert y.sum() == 3


def test_dnf_label(fixture_df):
    y = get("dnf").label_fn(fixture_df)
    assert y.sum() == 2


def test_winner_label_higher_for_better_finish(fixture_df):
    y = get("winner").label_fn(fixture_df)
    # Winner (pos 1) should have a strictly higher score than runner-up
    assert y.iloc[0] > y.iloc[1] > y.iloc[2]


def test_quali_features_exclude_quali_position():
    """quali target must not leak quali_position as a feature."""
    target = get("quali")
    assert "quali_position" not in target.features
    assert "quali_gap_to_pole_ms" not in target.features

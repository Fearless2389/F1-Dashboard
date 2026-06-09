"""Per-race z-score normalisation."""

import numpy as np
import pandas as pd

from src.models.normalize import add_per_race_zscores


def test_per_race_zscore_columns_appended():
    df = pd.DataFrame({
        "season": [2024, 2024, 2024, 2024],
        "round":  [1, 1, 2, 2],
        "driver_code": ["A", "B", "A", "B"],
        "quali_gap_to_pole_ms": [0.0, 500.0, 0.0, 1000.0],
    })
    out = add_per_race_zscores(df, cols=["quali_gap_to_pole_ms"])
    assert "quali_gap_to_pole_ms_zr" in out.columns
    # Within each race, values should average to 0
    grouped = out.groupby(["season", "round"])["quali_gap_to_pole_ms_zr"].mean()
    np.testing.assert_allclose(grouped.values, 0.0, atol=1e-6)


def test_handles_missing_columns():
    df = pd.DataFrame({"season": [1, 1], "round": [1, 1], "foo": [0, 1]})
    out = add_per_race_zscores(df)
    assert "quali_gap_to_pole_ms_zr" not in out.columns

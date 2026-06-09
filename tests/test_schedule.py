"""Schedule + circuit metadata loaders."""

import pandas as pd

from src.live import schedule as s


def test_circuit_id_normalisation():
    assert s._normalize_circuit_id("Sakhir")        == "bahrain"
    assert s._normalize_circuit_id("Monte Carlo")   == "monaco"
    assert s._normalize_circuit_id("Sao Paulo")     == "interlagos"
    assert s._normalize_circuit_id("Yas Island")    == "yas_marina"
    assert s._normalize_circuit_id("Imola")         == "imola"


def test_circuits_csv_loads():
    df = s.get_circuits()
    # circuits.csv ships with the repo — should load successfully
    assert not df.empty
    assert "circuit_id" in df.columns
    assert "lap_length_km" in df.columns
    # Sanity: at least Bahrain + Monaco + Monza
    ids = set(df["circuit_id"].tolist())
    assert {"bahrain", "monaco", "monza"} <= ids

"""
Centralised config for the F1 ML ingestion pipeline.
All paths and constants live here — import this everywhere.
"""

from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]

DATA_RAW       = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
CACHE_DIR      = ROOT / "data" / "cache"

DATA_RAW.mkdir(parents=True, exist_ok=True)
DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── Training window ──────────────────────────────────────────────────────────
# Pushed forward to include 2026 (post-regulation-change era). The 2026
# season has only 5 rounds in the dataset right now, so we use it as the
# test set — the model still trains on a healthy 7-season span and gets
# validated on a full 2025 season.
TRAIN_SEASONS   = list(range(2018, 2025))   # 2018–2024
VAL_SEASONS     = [2025]
TEST_SEASONS    = [2026]
PREDICT_SEASON  = 2026

ALL_SEASONS = TRAIN_SEASONS + VAL_SEASONS + TEST_SEASONS

# ── Raw output filenames ─────────────────────────────────────────────────────
RACE_RESULTS_FILE    = DATA_RAW / "race_results.parquet"
QUALI_RESULTS_FILE   = DATA_RAW / "qualifying_results.parquet"
WEATHER_FILE         = DATA_RAW / "weather_data.parquet"
LAP_DATA_FILE        = DATA_RAW / "lap_data.parquet"

# ── FastF1 settings ──────────────────────────────────────────────────────────
FASTF1_VERBOSITY = 0   # 0 = silent, 1 = info, 2 = debug

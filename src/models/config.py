"""
Model config — feature lists, hyperparameters, split definitions.
Single source of truth for everything training-related.
"""

from ..ingestion.config import TRAIN_SEASONS, VAL_SEASONS, TEST_SEASONS

# ── Feature groups ────────────────────────────────────────────────────────────

# Features available BEFORE the race (safe for inference)
PRE_RACE_FEATURES = [
    # Qualifying
    "quali_position",
    "quali_gap_to_pole_ms",
    "quali_position_vs_team",
    # Driver form
    "driver_avg_finish_L5",
    "driver_avg_finish_L10",
    "driver_dnf_rate_L10",
    "driver_points_L5",
    "driver_experience",
    "driver_circuit_avg_finish",
    # Team form
    "team_avg_finish_L5",
    "team_dnf_rate_L10",
    "team_points_L5",
    "team_avg_pit_time_ms",
    # Weather
    "air_temp_mean",
    "track_temp_mean",
    "rainfall",
    # Temporal
    "round_number",
    "season_stage",
]

# Features derived from in-race lap data (training only — not available pre-race)
IN_RACE_FEATURES = [
    "median_clean_lap_ms",
    "lap_time_vs_field_pct",
    "sector_consistency",
    "deg_slope",
    "starting_compound_enc",
    "num_stints",
    "num_pit_stops",
]

# Full feature set used for training (pre-race + in-race)
ALL_FEATURES = PRE_RACE_FEATURES + IN_RACE_FEATURES

TARGET = "top_10"

# ── Time-aware splits ─────────────────────────────────────────────────────────
SPLIT = {
    "train": TRAIN_SEASONS,   # 2018–2023
    "val":   VAL_SEASONS,     # 2024
    "test":  TEST_SEASONS,    # 2025
}

# ── Model hyperparameters ─────────────────────────────────────────────────────

LOGISTIC_PARAMS = {
    "C": 0.1,
    "max_iter": 1000,
    "solver": "lbfgs",
    "random_state": 42,
}

XGB_PARAMS = {
    "n_estimators": 500,
    "max_depth": 4,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "gamma": 1.0,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "objective": "binary:logistic",
    "eval_metric": "auc",
    "early_stopping_rounds": 30,
    "random_state": 42,
    "n_jobs": -1,
}

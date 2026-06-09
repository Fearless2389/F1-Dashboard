"""
Phase 6 — Inference Pipeline

Given qualifying results for an upcoming 2026 race, outputs predicted
top-10 probabilities and expected finishing positions for all drivers.

How it works:
  1. Load the trained XGBoost model
  2. For each driver, look up their latest rolling stats from the
     historical feature matrix (end of 2025 = most recent race)
  3. Attach qualifying features (position, gap to pole)
  4. Optionally attach weather forecast
  5. Predict probabilities → rank drivers

Only PRE_RACE_FEATURES are used — no in-race data required.

Usage:
    python -m src.inference.predict --input data/raw/quali_2026_bahrain.csv
    python -m src.inference.predict --race "Bahrain Grand Prix" --round 1

Input CSV format:  see data/raw/sample_quali_input.csv
"""

import argparse
import logging
import pickle
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from ..ingestion.config import DATA_PROCESSED
from ..models.config import PRE_RACE_FEATURES, TARGET

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

MODELS_DIR     = Path(__file__).resolve().parents[2] / "models" / "trained"
FEATURE_MATRIX = DATA_PROCESSED / "final_feature_matrix.parquet"
OUTPUT_DIR     = Path(__file__).resolve().parents[2] / "data" / "processed"


# ── Rolling stat lookup ───────────────────────────────────────────────────────

# Features we pull from historical data (latest values per driver)
ROLLING_FEATURES = [
    "driver_avg_finish_L5",
    "driver_avg_finish_L10",
    "driver_dnf_rate_L10",
    "driver_points_L5",
    "driver_experience",
    "driver_circuit_avg_finish",
    "team_avg_finish_L5",
    "team_dnf_rate_L10",
    "team_points_L5",
    "team_avg_pit_time_ms",
]


_CURRENT_SEASON_MIN_RACES = 3


def _get_latest_rolling_stats(
    feature_matrix: pd.DataFrame,
    circuit_id: str,
    season_cutoff: Optional[int] = None,
) -> pd.DataFrame:
    """
    For each driver, get their rolling stats from their most recent race
    up to and including `season_cutoff` (defaults to the latest season the
    feature matrix has).

    Regulation-change weighting: once a driver has at least
    `_CURRENT_SEASON_MIN_RACES` races in the latest season, we override
    their rolling stats with the latest-season-only row instead of the
    cross-season historical row. This stops the model from blending pre-
    regulation form (e.g. 2025 stats) with post-regulation team pairings
    (e.g. ANT at Mercedes in 2026). Drivers below the threshold (rookies,
    returnees) keep the historical row so their entry to the model isn't a
    one-race extrapolation.

    For `driver_circuit_avg_finish`, prefer the same-circuit current-season
    visit when available; else fall back to the cross-season mean.
    """
    if season_cutoff is None:
        season_cutoff = int(feature_matrix["season"].max())

    hist = feature_matrix[feature_matrix["season"] <= season_cutoff].copy()
    hist = hist.sort_values(["driver_code", "season", "round"])

    # Historical baseline — latest overall rolling stats per driver across
    # all seasons up to and including the cutoff.
    latest = (
        hist.groupby("driver_code")
        .last()
        .reset_index()
        [["driver_code", "team_name"] + ROLLING_FEATURES]
    )

    # Current-season override. For each driver with ≥ N races in the latest
    # season, take their latest-season-only row's rolling features and swap
    # those values in. (Rolling features are computed per-row in the matrix,
    # so the last row of the latest season already reflects the current-
    # season-only window once N races are in.)
    current_season = hist[hist["season"] == season_cutoff]
    if not current_season.empty:
        counts = current_season.groupby("driver_code").size()
        eligible = counts[counts >= _CURRENT_SEASON_MIN_RACES].index.tolist()
        if eligible:
            current_latest = (
                current_season[current_season["driver_code"].isin(eligible)]
                .groupby("driver_code")
                .last()
                .reset_index()
                [["driver_code", "team_name"] + ROLLING_FEATURES]
            )
            # Merge — current-season row wins for the rolling columns + team_name.
            cs_indexed = current_latest.set_index("driver_code")
            for col in ["team_name"] + ROLLING_FEATURES:
                if col in cs_indexed.columns:
                    latest.loc[
                        latest["driver_code"].isin(eligible), col
                    ] = latest.loc[
                        latest["driver_code"].isin(eligible), "driver_code"
                    ].map(cs_indexed[col])

    # Override driver_circuit_avg_finish with circuit-specific history.
    # Prefer current-season visit to this circuit when available.
    circuit_hist = hist[hist["circuit_id"].str.lower() == circuit_id.lower()]
    if not circuit_hist.empty:
        current_circuit = circuit_hist[circuit_hist["season"] == season_cutoff]
        source = current_circuit if not current_circuit.empty else circuit_hist
        circuit_avg = (
            source.groupby("driver_code")["finish_position_clean"]
            .mean()
            .reset_index()
            .rename(columns={"finish_position_clean": "_circuit_avg"})
        )
        latest = latest.merge(circuit_avg, on="driver_code", how="left")
        mask = latest["_circuit_avg"].notna()
        latest.loc[mask, "driver_circuit_avg_finish"] = latest.loc[mask, "_circuit_avg"]
        latest.drop(columns=["_circuit_avg"], inplace=True)

    return latest


# ── Qualifying feature construction ──────────────────────────────────────────

def _build_quali_features(quali_df: pd.DataFrame) -> pd.DataFrame:
    """
    From raw qualifying input, compute:
      - quali_position (already in input)
      - quali_gap_to_pole_ms
      - quali_position_vs_team
    """
    quali = quali_df.copy()

    # Best time across Q1/Q2/Q3
    time_cols = [c for c in ["q1_time_ms", "q2_time_ms", "q3_time_ms"] if c in quali.columns]
    if time_cols:
        quali["best_quali_time_ms"] = quali[time_cols].min(axis=1)
    elif "best_quali_time_ms" not in quali.columns:
        # Fall back to estimating from position (rough proxy)
        quali["best_quali_time_ms"] = np.nan

    # Gap to pole
    pole_time = quali["best_quali_time_ms"].min()
    quali["quali_gap_to_pole_ms"] = quali["best_quali_time_ms"] - pole_time

    # Intra-team quali delta
    if "team_name" in quali.columns:
        team_best = quali.groupby("team_name")["quali_position"].transform("min")
        quali["quali_position_vs_team"] = (quali["quali_position"] - team_best).astype("Int8")
    else:
        quali["quali_position_vs_team"] = 0

    return quali


# ── Weather defaults ──────────────────────────────────────────────────────────

DEFAULT_WEATHER = {
    "air_temp_mean":   25.0,
    "track_temp_mean": 35.0,
    "rainfall":        False,
}


def _attach_weather(df: pd.DataFrame, weather: dict = None) -> pd.DataFrame:
    w = {**DEFAULT_WEATHER, **(weather or {})}
    for col, val in w.items():
        df[col] = val
    return df


# ── Temporal features ─────────────────────────────────────────────────────────

def _attach_temporal(df: pd.DataFrame, round_num: int, total_rounds: int = 24) -> pd.DataFrame:
    df["round_number"] = round_num
    stage = int(round_num / total_rounds * 3) - 1
    df["season_stage"] = max(0, min(2, stage))
    return df


# ── Core predict function ─────────────────────────────────────────────────────

def predict_race(
    quali_input: pd.DataFrame,
    circuit_id: str,
    round_num: int,
    season: int = 2026,
    weather: dict = None,
    total_rounds: int = 24,
    model_name: str = "xgb_top10.pkl",
) -> pd.DataFrame:
    """
    Main inference function.

    Args:
        quali_input:  DataFrame with columns:
                      driver_code, team_name, quali_position,
                      [q1_time_ms, q2_time_ms, q3_time_ms] or best_quali_time_ms
        circuit_id:   e.g. "Bahrain International Circuit"
        round_num:    Race round number (1–24)
        season:       Target season (default 2026)
        weather:      Dict with air_temp_mean, track_temp_mean, rainfall
        total_rounds: Total rounds in season (for season_stage)
        model_name:   Artifact filename in models/trained/

    Returns:
        DataFrame ranked by predicted probability:
        driver_code | team_name | prob_top10 | expected_position
    """

    # ── Load model ────────────────────────────────────────────────────────────
    model_path = MODELS_DIR / model_name
    if not model_path.exists():
        log.error(f"Model not found: {model_path}. Run train.py first.")
        sys.exit(1)
    with open(model_path, "rb") as f:
        artifact = pickle.load(f)

    # ── Load historical feature matrix ────────────────────────────────────────
    if not FEATURE_MATRIX.exists():
        log.error(f"Feature matrix not found. Run build_features.py first.")
        sys.exit(1)
    feature_matrix = pd.read_parquet(FEATURE_MATRIX)

    # ── Build feature row per driver ──────────────────────────────────────────
    log.info(f"Building features for {len(quali_input)} drivers...")

    rolling = _get_latest_rolling_stats(feature_matrix, circuit_id)
    quali   = _build_quali_features(quali_input)

    # Merge rolling stats onto qualifying data
    # Use quali team_name as primary, fall back to rolling team_name
    features = quali.merge(
        rolling.drop(columns=["team_name"], errors="ignore"),
        on="driver_code",
        how="left",
    )

    # Attach weather + temporal
    features = _attach_weather(features, weather)
    features = _attach_temporal(features, round_num, total_rounds)

    # ── Predict ───────────────────────────────────────────────────────────────
    model_features = [f for f in artifact["features"] if f in PRE_RACE_FEATURES]
    available = [f for f in model_features if f in features.columns]
    missing   = [f for f in model_features if f not in features.columns]

    if missing:
        log.warning(f"  Missing features (will be imputed): {missing}")
        for f in missing:
            features[f] = np.nan

    X = features[model_features].copy()
    X_imp = pd.DataFrame(
        artifact["imputer"].transform(X),
        columns=model_features,
        index=X.index,
    )

    # Re-train artifact may have been trained with ALL_FEATURES including in-race.
    # For inference we only have pre-race features — fill in-race cols with NaN.
    all_model_cols = artifact["features"]
    for col in all_model_cols:
        if col not in X_imp.columns:
            X_imp[col] = np.nan
    X_imp = X_imp[all_model_cols]

    # Second imputation pass for in-race NaN columns
    X_imp = X_imp.fillna(X_imp.median())

    # Branch on model kind — binary classifier vs ranker vs regressor.
    # We always populate `prob_top10` so downstream code stays uniform; for
    # ranker/regressor targets it's a normalised score, not a true probability.
    kind = artifact.get("kind", "binary")
    model_obj = artifact["model"]

    if kind == "binary" and hasattr(model_obj, "predict_proba"):
        probs = model_obj.predict_proba(X_imp)[:, 1]
    elif kind == "ranker":
        raw = np.asarray(model_obj.predict(X_imp), dtype=float)
        # Softmax → field sums to 1 (interpreted as win-probability share)
        exp = np.exp(raw - raw.max())
        probs = exp / exp.sum()
    elif kind == "regression":
        raw = np.asarray(model_obj.predict(X_imp), dtype=float)
        # Lower predicted (e.g. position) = better. Invert + softmax.
        inv = -raw
        exp = np.exp(inv - inv.max())
        probs = exp / exp.sum()
    else:
        probs = model_obj.predict_proba(X_imp)[:, 1]

    # ── Build output ──────────────────────────────────────────────────────────
    output = features[["driver_code", "team_name", "quali_position"]].copy()
    output["prob_top10"] = probs

    # Expected position: rank by probability
    output = output.sort_values("prob_top10", ascending=False).reset_index(drop=True)
    output["expected_position"] = range(1, len(output) + 1)
    output["prob_top10"] = output["prob_top10"].round(4)

    log.info(f"\n{'─'*55}")
    log.info(f"  {season} Round {round_num} — {circuit_id}")
    log.info(f"{'─'*55}")
    log.info(
        output[["expected_position", "driver_code", "team_name",
                "quali_position", "prob_top10"]]
        .to_string(index=False)
    )
    log.info(f"{'─'*55}\n")

    return output


# ── CLI ───────────────────────────────────────────────────────────────────────

def _load_input(path: str) -> pd.DataFrame:
    return pd.read_csv(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict F1 race top-10 probabilities")
    parser.add_argument("--input",   required=True, help="Path to qualifying CSV input")
    parser.add_argument("--circuit", required=True, help="Circuit ID / name")
    parser.add_argument("--round",   type=int, required=True, help="Round number")
    parser.add_argument("--season",  type=int, default=2026, help="Season year")
    parser.add_argument("--output",  default=None, help="Save results to CSV path")
    parser.add_argument("--rain",    action="store_true", help="Flag race as wet")
    args = parser.parse_args()

    quali = _load_input(args.input)
    weather = {"rainfall": args.rain} if args.rain else None

    result = predict_race(
        quali_input=quali,
        circuit_id=args.circuit,
        round_num=args.round,
        season=args.season,
        weather=weather,
    )

    if args.output:
        result.to_csv(args.output, index=False)
        log.info(f"Results saved → {args.output}")

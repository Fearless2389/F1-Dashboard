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
    For each driver, return rolling stats reflecting their form **after**
    the most recent race in the feature matrix — i.e. ready to feed the
    model when predicting the *next* race.

    Why this isn't just `feature_matrix.groupby('driver_code').last()`:
    The rolling columns in the matrix are built with `shift(1)` to keep
    training leakage-free — at row N they show the L5/L10 over races
    [N-5, N-1], excluding race N itself. That's correct for training,
    but at inference time we want "form going INTO the next race", which
    means the window must INCLUDE the latest race in the matrix.

    We therefore recompute the L5/L10/DNF/points stats here from the raw
    `finish_position_clean`/`is_dnf`/`points` columns, taking the most
    recent N races per driver inclusive of the latest. (Old code copied
    the shifted L5 from the latest row and was effectively predicting
    "next race" using "two races ago" form.)

    Regulation-change weighting: once a driver has at least
    `_CURRENT_SEASON_MIN_RACES` races in the latest season, the raw-stat
    window is restricted to the current season only. This keeps pre-
    regulation form from polluting post-regulation team pairings
    (e.g. ANT-at-Mercedes in 2026). Drivers below the threshold keep the
    cross-season window so rookies aren't a single-race extrapolation.

    For `driver_circuit_avg_finish`, prefer the same-circuit current-season
    visit when available; else fall back to the cross-season mean.

    Other features (`driver_experience`, `team_avg_pit_time_ms`) that don't
    have a clean inference-time recomputation are still pulled from the
    matrix's latest row.
    """
    if season_cutoff is None:
        season_cutoff = int(feature_matrix["season"].max())

    hist = feature_matrix[feature_matrix["season"] <= season_cutoff].copy()
    hist = hist.sort_values(["driver_code", "season", "round"])

    # Pull non-rolling fields (team_name, driver_experience, pit time) from
    # the latest row per driver — these don't suffer from the shift problem.
    latest = (
        hist.groupby("driver_code")
        .last()
        .reset_index()
        [["driver_code", "team_name", "driver_experience",
          "team_avg_pit_time_ms"]]
    )

    # Recompute the inclusive-of-latest rolling stats per driver.
    # Default window source: full driver history. Override with current-
    # season-only history once the driver has ≥ N races this season.
    current_counts = (
        hist[hist["season"] == season_cutoff]
        .groupby("driver_code")
        .size()
    )

    rolled_rows: list[dict] = []
    for code, df_driver in hist.groupby("driver_code"):
        use_current_only = current_counts.get(code, 0) >= _CURRENT_SEASON_MIN_RACES
        if use_current_only:
            df_driver = df_driver[df_driver["season"] == season_cutoff]
        finishes = df_driver["finish_position_clean"].dropna().tolist()
        dnfs = df_driver["is_dnf"].fillna(False).astype(int).tolist()
        points = df_driver["points"].fillna(0.0).tolist()
        l5 = finishes[-5:]
        l10 = finishes[-10:]
        dnf10 = dnfs[-10:]
        pts5 = points[-5:]
        rolled_rows.append({
            "driver_code": code,
            "driver_avg_finish_L5":  float(np.mean(l5)) if l5 else np.nan,
            "driver_avg_finish_L10": float(np.mean(l10)) if l10 else np.nan,
            "driver_dnf_rate_L10":   float(np.mean(dnf10)) if dnf10 else np.nan,
            "driver_points_L5":      float(sum(pts5)),
        })
    rolled = pd.DataFrame(rolled_rows)
    latest = latest.merge(rolled, on="driver_code", how="left")

    # ── Team rolling stats — recompute inclusive-of-latest per team ──────────
    # Each driver-row's team rolling features should reflect their CURRENT
    # team's form, not the team they happen to be at right now joined to a
    # stale shifted column.
    team_hist = hist.dropna(subset=["team_name"]).sort_values(
        ["team_name", "season", "round"]
    )

    team_rolled_rows: list[dict] = []
    for team, df_team in team_hist.groupby("team_name"):
        if _CURRENT_SEASON_MIN_RACES <= len(df_team[df_team["season"] == season_cutoff]):
            df_team = df_team[df_team["season"] == season_cutoff]
        finishes = df_team["finish_position_clean"].dropna().tolist()
        dnfs = df_team["is_dnf"].fillna(False).astype(int).tolist()
        points = df_team["points"].fillna(0.0).tolist()
        l5 = finishes[-5:]
        l10 = finishes[-10:]
        dnf10 = dnfs[-10:]
        pts5 = points[-5:]
        team_rolled_rows.append({
            "team_name": team,
            "team_avg_finish_L5":  float(np.mean(l5)) if l5 else np.nan,
            "team_dnf_rate_L10":   float(np.mean(dnf10)) if dnf10 else np.nan,
            "team_points_L5":      float(sum(pts5)),
        })
    team_rolled = pd.DataFrame(team_rolled_rows)
    latest = latest.merge(team_rolled, on="team_name", how="left")

    # ── Circuit-specific historical average ──────────────────────────────────
    # Same logic as before — prefer current-season visit to this circuit when
    # available, else fall back to the cross-season mean.
    circuit_hist = hist[hist["circuit_id"].str.lower() == circuit_id.lower()]
    if not circuit_hist.empty:
        current_circuit = circuit_hist[circuit_hist["season"] == season_cutoff]
        source = current_circuit if not current_circuit.empty else circuit_hist
        circuit_avg = (
            source.groupby("driver_code")["finish_position_clean"]
            .mean()
            .reset_index()
            .rename(columns={"finish_position_clean": "driver_circuit_avg_finish"})
        )
        latest = latest.merge(circuit_avg, on="driver_code", how="left")
    else:
        latest["driver_circuit_avg_finish"] = latest["driver_avg_finish_L10"]
    # Fill any remaining NaN circuit-avg with the driver's L10 average.
    latest["driver_circuit_avg_finish"] = latest["driver_circuit_avg_finish"].fillna(
        latest["driver_avg_finish_L10"]
    )

    return latest[["driver_code", "team_name"] + ROLLING_FEATURES]


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

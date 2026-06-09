"""Prediction endpoints — top-10, podium, winner, DNF, fastest lap, simulator."""

import logging
from itertools import combinations

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from ...inference.predict import predict_race
from ...inference.simulator import monte_carlo_race
from ..deps import get_feature_matrix, load_model
from ..schemas import (
    DriverPrediction,
    PodiumProbability,
    PredictionRequest,
    PredictionResponse,
    SimulationRequest,
    SimulationResponse,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/predict", tags=["predict"])


TARGET_TO_MODEL = {
    "top10":        "xgb_top10.pkl",
    "podium":       "xgb_podium.pkl",
    "winner":       "lgbm_winner.pkl",
    "dnf":          "xgb_dnf.pkl",
    "fastest_lap":  "lgbm_fastest_lap.pkl",
}


def _quali_df(req: PredictionRequest) -> pd.DataFrame:
    return pd.DataFrame([q.model_dump() for q in req.quali])


def _weather_dict(req: PredictionRequest) -> dict:
    return req.weather.model_dump()


def _run_target(target: str, req: PredictionRequest, quali_df: pd.DataFrame) -> pd.DataFrame:
    model_name = TARGET_TO_MODEL.get(target)
    if model_name is None:
        return pd.DataFrame()
    artifact = load_model(model_name)
    if artifact is None:
        log.info("Model %s not available — falling back to top10 if requested", model_name)
        return pd.DataFrame()
    try:
        return predict_race(
            quali_input=quali_df,
            circuit_id=req.circuit_id,
            round_num=req.round,
            season=req.season,
            weather=_weather_dict(req),
            model_name=model_name,
        )
    except Exception as exc:
        log.warning("Prediction with %s failed: %s", model_name, exc)
        return pd.DataFrame()


@router.post("", response_model=PredictionResponse)
def predict(req: PredictionRequest) -> PredictionResponse:
    if not req.quali:
        raise HTTPException(400, "quali list cannot be empty")

    quali_df = _quali_df(req)
    fm = get_feature_matrix()
    if fm is None:
        raise HTTPException(503, "Feature matrix unavailable — run the pipeline first")

    # Run each requested target; fall back to top10 model where target-specific is missing
    results: dict[str, pd.DataFrame] = {}
    for tgt in req.targets:
        df = _run_target(tgt, req, quali_df)
        if df.empty and tgt != "top10":
            # Reuse top10 model's probabilities as a fallback for the missing target
            top10 = results.get("top10")
            if top10 is None:
                top10 = _run_target("top10", req, quali_df)
                results["top10"] = top10
        results[tgt] = df

    # Build per-driver rows from the union of all results
    drivers: dict[str, DriverPrediction] = {}

    def _ensure(driver_code: str, team_name: str, quali_pos: int) -> DriverPrediction:
        if driver_code not in drivers:
            drivers[driver_code] = DriverPrediction(
                driver_code=driver_code,
                team_name=team_name,
                quali_position=int(quali_pos),
                expected_position=0,
            )
        return drivers[driver_code]

    # Seed from quali so we have every driver even if predictions are empty
    for q in req.quali:
        _ensure(q.driver_code, q.team_name, q.quali_position)

    def _attach(target: str, prob_field: str, df: pd.DataFrame) -> None:
        if df.empty or "prob_top10" not in df.columns:
            return
        for _, row in df.iterrows():
            d = _ensure(row["driver_code"], row.get("team_name", ""), int(row["quali_position"]))
            setattr(d, prob_field, float(row["prob_top10"]))

    _attach("top10", "prob_top10", results.get("top10", pd.DataFrame()))
    _attach("podium", "prob_podium", results.get("podium", pd.DataFrame()))
    _attach("winner", "prob_win", results.get("winner", pd.DataFrame()))
    _attach("dnf", "prob_dnf", results.get("dnf", pd.DataFrame()))
    _attach("fastest_lap", "prob_fastest_lap", results.get("fastest_lap", pd.DataFrame()))

    # Normalise winner probs (if available) so they sum to 1 across the field
    win_probs = [d.prob_win for d in drivers.values() if d.prob_win is not None]
    if win_probs and sum(win_probs) > 0:
        total = float(sum(win_probs))
        for d in drivers.values():
            if d.prob_win is not None:
                d.prob_win = d.prob_win / total

    # Expected position: rank by best available signal (winner prob → top10 prob → quali)
    def _sort_key(d: DriverPrediction) -> float:
        if d.prob_win is not None:
            return -d.prob_win
        if d.prob_top10 is not None:
            return -d.prob_top10
        return float(d.quali_position)

    ordered = sorted(drivers.values(), key=_sort_key)
    for i, d in enumerate(ordered, start=1):
        d.expected_position = i

    # Top-5 podium combinations (combinatorial over highest-podium-prob drivers)
    podium_combos: list[PodiumProbability] = []
    podium_sorted = sorted(
        (d for d in drivers.values() if d.prob_podium is not None),
        key=lambda d: -(d.prob_podium or 0),
    )[:8]
    if len(podium_sorted) >= 3:
        scored: list[tuple[list[str], float]] = []
        for trio in combinations(podium_sorted, 3):
            # Crude joint approximation: product of marginals, conditioned out
            p = float(np.prod([d.prob_podium for d in trio]))
            scored.append(([d.driver_code for d in trio], p))
        scored.sort(key=lambda x: -x[1])
        # Renormalise top-5
        top_scores = scored[:5]
        total = sum(s for _, s in top_scores) or 1.0
        podium_combos = [
            PodiumProbability(drivers=names, probability=score / total)
            for names, score in top_scores
        ]

    return PredictionResponse(
        season=req.season,
        round=req.round,
        circuit_id=req.circuit_id,
        drivers=ordered,
        podium_combinations=podium_combos,
    )


@router.post("/simulate", response_model=SimulationResponse)
def simulate(req: SimulationRequest) -> SimulationResponse:
    if not req.quali:
        raise HTTPException(400, "quali list cannot be empty")

    # First get marginal predictions
    pred = predict(PredictionRequest(**req.model_dump(exclude={"n_iterations"})))

    # Run Monte Carlo
    drivers = pred.drivers
    sim = monte_carlo_race(
        drivers=[d.model_dump() for d in drivers],
        n_iterations=req.n_iterations,
    )
    return SimulationResponse(
        season=req.season,
        round=req.round,
        n_iterations=req.n_iterations,
        **sim,
    )

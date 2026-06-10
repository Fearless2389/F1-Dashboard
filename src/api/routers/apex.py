"""Apex Predictor endpoint — curated next-race prediction bundle."""

import logging

from fastapi import APIRouter, HTTPException

from ...inference.apex import lap_by_lap_comparison, predict_apex, race_accuracy
from ..schemas import AccuracyResponse, ApexResponse, LapByLapResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/apex", tags=["apex"])


@router.get("/next", response_model=ApexResponse)
def apex_next() -> ApexResponse:
    """Auto-selects the next upcoming race and returns the full prediction bundle."""
    try:
        result = predict_apex(season=None, round_num=None)
    except RuntimeError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        log.exception("Apex prediction failed")
        raise HTTPException(500, f"Apex prediction failed: {exc}") from exc
    return ApexResponse(**result)


@router.get("/{season}/{round_num}", response_model=ApexResponse)
def apex_race(season: int, round_num: int) -> ApexResponse:
    """Run the apex prediction for a specific race (any past or upcoming round)."""
    try:
        result = predict_apex(season=season, round_num=round_num)
    except RuntimeError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        log.exception("Apex prediction failed for %s R%s", season, round_num)
        raise HTTPException(500, f"Apex prediction failed: {exc}") from exc
    return ApexResponse(**result)


@router.get("/{season}/{round_num}/accuracy", response_model=AccuracyResponse)
def apex_accuracy(season: int, round_num: int) -> AccuracyResponse:
    """Predicted P1-P10 vs the actual P1-P10 finishing order for a race
    that has results published. Used by the Apex page's accuracy panel."""
    result = race_accuracy(season, round_num)
    if result is None:
        raise HTTPException(404, f"No actual results yet for {season} R{round_num}")
    return AccuracyResponse(**result)


@router.get("/{season}/{round_num}/lap-by-lap", response_model=LapByLapResponse)
def apex_lap_by_lap(season: int, round_num: int) -> LapByLapResponse:
    """Predicted vs actual finishing position across the race, sampled every
    5 laps. Only available for races whose replay data has been ingested."""
    result = lap_by_lap_comparison(season, round_num)
    if result is None:
        raise HTTPException(404, f"No replay data cached for {season} R{round_num}")
    return LapByLapResponse(**result)

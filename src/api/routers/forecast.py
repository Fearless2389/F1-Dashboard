"""Race Forecast — Monte Carlo simulation surface for the /forecast page."""

import logging

from fastapi import APIRouter, HTTPException

from ...inference.forecast import race_forecast
from ..schemas import ForecastResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("/next", response_model=ForecastResponse)
def forecast_next() -> ForecastResponse:
    """Run the 10K Monte Carlo for the next upcoming race."""
    try:
        result = race_forecast(season=None, round_num=None)
    except RuntimeError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        log.exception("Race forecast failed")
        raise HTTPException(500, f"Race forecast failed: {exc}") from exc
    return ForecastResponse(**result)


@router.get("/{season}/{round_num}", response_model=ForecastResponse)
def forecast_race(season: int, round_num: int) -> ForecastResponse:
    """Run the 10K Monte Carlo for a specific race."""
    try:
        result = race_forecast(season=season, round_num=round_num)
    except RuntimeError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        log.exception("Race forecast failed for %s R%s", season, round_num)
        raise HTTPException(500, f"Race forecast failed: {exc}") from exc
    return ForecastResponse(**result)

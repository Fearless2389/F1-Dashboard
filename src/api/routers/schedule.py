"""Season schedule + circuit + weather forecast endpoints."""

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from ...live import weather_forecast
from ...live.schedule import enriched_schedule, get_circuits, get_season_schedule
from ..schemas import CircuitMeta, RaceEvent, ScheduleResponse, WeatherForecast

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def _clean(v: Any) -> Any:
    """Return None for NaN/NaT/empty, otherwise pass through.

    Pandas merge() fills missing rows with NaN even for object columns,
    and Pydantic v2 rejects NaN in non-optional fields. This bridges them.
    """
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
    except (TypeError, ValueError):
        pass
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


def _row_to_event(row: dict, include_weather: bool = False) -> RaceEvent:
    circuit_meta = None
    weather = None

    cid = _clean(row.get("circuit_id"))
    lat = _clean(row.get("lat"))
    lon = _clean(row.get("lon"))

    # Circuit meta — only attach if we have anything beyond the id itself.
    if cid:
        meta_dict = {
            "circuit_id":          cid,
            "name":                _clean(row.get("name")),
            "country":             _clean(row.get("country")),
            "lat":                 lat,
            "lon":                 lon,
            "lap_length_km":       _clean(row.get("lap_length_km")),
            "num_corners":         _clean(row.get("num_corners")),
            "drs_zones":           _clean(row.get("drs_zones")),
            "downforce_level":     _clean(row.get("downforce_level")),
            "overtake_difficulty": _clean(row.get("overtake_difficulty")),
            "typical_air_temp_c":  _clean(row.get("typical_air_temp_c")),
            "wet_race_rate":       _clean(row.get("wet_race_rate")),
        }
        # Coerce numerics that may come in as floats but the schema wants int
        for int_field in ("num_corners", "drs_zones", "overtake_difficulty"):
            if meta_dict.get(int_field) is not None:
                try:
                    meta_dict[int_field] = int(meta_dict[int_field])
                except (TypeError, ValueError):
                    meta_dict[int_field] = None
        try:
            circuit_meta = CircuitMeta(**meta_dict)
        except Exception as exc:
            log.warning("CircuitMeta validation failed for %s: %s", cid, exc)
            circuit_meta = CircuitMeta(circuit_id=cid)

    if include_weather and lat is not None and lon is not None:
        try:
            race_start = _clean(row.get("session5_date")) or _clean(row.get("event_date"))
            summary = weather_forecast.race_window_summary(
                lat=float(lat),
                lon=float(lon),
                race_start_iso=str(race_start) if race_start else None,
            )
            weather = WeatherForecast(**summary)
        except Exception as exc:
            log.warning("Weather summary failed: %s", exc)

    event_date = _clean(row.get("event_date"))
    session5_date = _clean(row.get("session5_date"))

    return RaceEvent(
        season=int(row["season"]),
        round=int(row["round"]),
        race_name=str(_clean(row.get("race_name")) or ""),
        country=str(_clean(row.get("country")) or ""),
        location=str(_clean(row.get("location")) or ""),
        circuit_id=str(cid or ""),
        event_date=str(event_date) if event_date else None,
        session5_date=str(session5_date) if session5_date else None,
        circuit_meta=circuit_meta,
        weather_forecast=weather,
    )


# NOTE: Static paths MUST be declared before the `/{year}` and
# `/{year}/{round_num}` routes — FastAPI matches in declaration order, and
# "circuits" would otherwise be parsed as an int year and produce 422.

@router.get("/circuits/all", response_model=list[CircuitMeta])
def list_circuits() -> list[CircuitMeta]:
    df = get_circuits()
    if df.empty:
        return []
    return [CircuitMeta(**r) for r in df.to_dict("records")]


@router.get("/{year}", response_model=ScheduleResponse)
def get_year_schedule(year: int, include_weather: bool = False) -> ScheduleResponse:
    sched = enriched_schedule(year)
    if sched.empty:
        raise HTTPException(404, f"No schedule data for {year}")
    events = [_row_to_event(r, include_weather=include_weather)
              for r in sched.to_dict("records")]
    return ScheduleResponse(season=year, events=events)


@router.get("/{year}/{round_num}", response_model=RaceEvent)
def get_round(year: int, round_num: int, include_weather: bool = True) -> RaceEvent:
    sched = enriched_schedule(year)
    if sched.empty:
        raise HTTPException(404, f"No schedule data for {year}")
    row = sched[sched["round"] == round_num]
    if row.empty:
        raise HTTPException(404, f"Round {round_num} not found in {year}")
    return _row_to_event(row.iloc[0].to_dict(), include_weather=include_weather)

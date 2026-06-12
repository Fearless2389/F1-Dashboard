"""Season schedule + circuit + weather forecast endpoints."""

import logging
import math
from datetime import datetime, timezone
from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException

from ...live import jolpica_client as jolpica
from ...live import weather_forecast
from ...live.schedule import enriched_schedule, get_circuits, get_season_schedule
from ..schemas import (
    CircuitMeta,
    LapRecord,
    RaceEvent,
    ResultRow,
    ResultsResponse,
    ScheduleResponse,
    WeatherForecast,
)

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
    event_format_raw = _clean(row.get("event_format"))
    event_format = str(event_format_raw) if event_format_raw else None
    # FastF1 sprint formats vary by year ("sprint", "sprint_shootout",
    # "sprint_qualifying"); the substring is the only consistent signal.
    has_sprint = bool(event_format and "sprint" in event_format.lower())

    return RaceEvent(
        season=int(row["season"]),
        round=int(row["round"]),
        race_name=str(_clean(row.get("race_name")) or ""),
        country=str(_clean(row.get("country")) or ""),
        location=str(_clean(row.get("location")) or ""),
        circuit_id=str(cid or ""),
        event_date=str(event_date) if event_date else None,
        session5_date=str(session5_date) if session5_date else None,
        event_format=event_format,
        has_sprint=has_sprint,
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


# Per-circuit lap-record cache. Walks Jolpica race results across multiple
# seasons to find the all-time fastest lap recorded at this circuit. Cached
# for an hour because the data only changes when a fresh fastest lap is set.
_lap_record_cache: dict[str, LapRecord] = {}


# Jolpica/Ergast use their own circuit IDs that don't always match the ones
# our schedule produces. We translate so e.g. "barcelona" matches "catalunya"
# in the Jolpica payload and "melbourne" matches "albert_park".
_JOLPICA_TO_PADDOCK: dict[str, str] = {
    "albert_park":           "melbourne",
    "catalunya":             "barcelona",
    "rodriguez":             "mexico",
    "americas":              "austin",
    "yas_marina":            "yas_marina",
    "marina_bay":            "singapore",
    "interlagos":            "interlagos",
    "BAK":                   "baku",
    "baku":                  "baku",
    "vegas":                 "vegas",
    "losail":                "losail",
    "imola":                 "imola",
    "miami":                 "miami",
    "monaco":                "monaco",
    "monza":                 "monza",
    "red_bull_ring":         "spielberg",
    "silverstone":           "silverstone",
    "spa":                   "spa",
    "suzuka":                "suzuka",
    "shanghai":              "shanghai",
    "hungaroring":           "hungaroring",
    "zandvoort":             "zandvoort",
    "villeneuve":            "montreal",
    "jeddah":                "jeddah",
    "bahrain":               "bahrain",
    "ricard":                "le_castellet",
    "portimao":              "portimao",
    "mugello":               "mugello",
    "nurburgring":           "nurburgring",
    "istanbul":              "istanbul",
    "hockenheimring":        "hockenheim",
    "sochi":                 "sochi",
}


def _jolpica_to_paddock(jolpica_id: str | None) -> str | None:
    if not jolpica_id:
        return None
    j = jolpica_id.lower()
    return _JOLPICA_TO_PADDOCK.get(j, j)


def _time_to_ms(t: str) -> Optional[int]:
    """Parse an Ergast/Jolpica lap-time string like '1:14.260' into ms.
    Returns None for inputs that don't parse so they can be filtered out."""
    if not t:
        return None
    try:
        if ":" in t:
            mins, rest = t.split(":", 1)
            seconds = float(rest)
            return int((int(mins) * 60 + seconds) * 1000)
        return int(float(t) * 1000)
    except (TypeError, ValueError):
        return None


@router.get("/circuits/{circuit_id}/lap-record", response_model=LapRecord)
def circuit_lap_record(circuit_id: str) -> LapRecord:
    """All-time fastest lap recorded at this circuit across the seasons we
    can probe. Pulls Jolpica race results per season and keeps the minimum
    `FastestLap.Time` value."""
    if circuit_id in _lap_record_cache:
        return _lap_record_cache[circuit_id]

    best: dict | None = None
    best_ms: Optional[int] = None

    # Walk the last ~10 seasons of paginated season-wide results. Ergast/
    # Jolpica only attached FastestLap fields from 2004 onwards and the
    # recent-decade window covers every realistic lap-record holder; older
    # seasons add noise + per-call latency without meaningfully improving
    # the answer.
    for season in range(2024, 2014, -1):
        offset = 0
        page_size = 100
        while True:
            try:
                raw = jolpica._get(f"{season}/results", limit=page_size, offset=offset)
            except Exception:
                break
            mr = raw.get("MRData", {})
            races = mr.get("RaceTable", {}).get("Races", [])
            if not races:
                break
            page_rows = 0
            for race in races:
                race_circuit_id = (race.get("Circuit") or {}).get("circuitId")
                paddock_id = _jolpica_to_paddock(race_circuit_id)
                if paddock_id != circuit_id.lower():
                    # Cheap miss path — still need to advance offset by this
                    # race's result count so pagination doesn't loop.
                    page_rows += len(race.get("Results", []))
                    continue
                race_name = str(race.get("raceName", ""))
                for r in race.get("Results", []):
                    page_rows += 1
                    fl = r.get("FastestLap") or {}
                    time_str = (fl.get("Time") or {}).get("time")
                    if not time_str:
                        continue
                    ms = _time_to_ms(str(time_str))
                    if ms is None:
                        continue
                    if best_ms is None or ms < best_ms:
                        drv = r.get("Driver", {})
                        avg = (fl.get("AverageSpeed") or {}).get("speed")
                        best = {
                            "circuit_id":         circuit_id,
                            "driver_code":        drv.get("code") or (drv.get("driverId") or "").upper()[:3] or None,
                            "driver_name":        f'{drv.get("givenName","")} {drv.get("familyName","")}'.strip() or None,
                            "time":               str(time_str),
                            "season":             int(race.get("season") or season),
                            "race_name":          race_name or None,
                            "average_speed_kph":  float(avg) if avg is not None else None,
                        }
                        best_ms = ms
            try:
                total = int(mr.get("total", 0))
            except (TypeError, ValueError):
                total = 0
            offset += page_rows
            if page_rows == 0 or offset >= total:
                break

    record = LapRecord(circuit_id=circuit_id) if best is None else LapRecord(**best)
    _lap_record_cache[circuit_id] = record
    return record


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


def _df_to_result_rows(df: pd.DataFrame) -> list[ResultRow]:
    rows: list[ResultRow] = []
    if df.empty:
        return rows
    # Position-first sort so the response is already in the right order for
    # the UI; NaN positions (DNFs / DNQs) land at the tail.
    df = df.copy()
    df["_sort_pos"] = df["position"].fillna(99)
    for r in df.sort_values("_sort_pos").to_dict("records"):
        rows.append(ResultRow(
            position=_clean(r.get("position")),
            driver_code=str(r.get("driver_code") or ""),
            driver_number=_clean(r.get("driver_number")),
            team_name=_clean(r.get("team_name")),
            grid=_clean(r.get("grid")),
            points=float(r.get("points") or 0.0),
            status=_clean(r.get("status")),
            laps=_clean(r.get("laps")),
            time=_clean(r.get("time")),
        ))
    return rows


@router.get("/{year}/{round_num}/results", response_model=ResultsResponse)
def get_race_results(year: int, round_num: int) -> ResultsResponse:
    """Race results for a single (year, round) — sourced from Jolpica/Ergast.
    Returns an empty list for races that haven't run yet (the UI hides the
    panel when rows is empty)."""
    try:
        df = jolpica.race_results(year, round_num)
    except Exception as exc:
        log.warning("Jolpica race_results failed for %s R%s: %s", year, round_num, exc)
        df = pd.DataFrame()
    race_name = None
    if not df.empty and "race_name" in df.columns:
        race_name = str(df["race_name"].iloc[0])
    return ResultsResponse(
        season=year,
        round=round_num,
        race_name=race_name,
        kind="race",
        rows=_df_to_result_rows(df),
    )


@router.get("/{year}/{round_num}/sprint", response_model=ResultsResponse)
def get_sprint_results(year: int, round_num: int) -> ResultsResponse:
    """Sprint race results for a single (year, round). Returns an empty list
    for weekends without a sprint (the UI uses that to hide the sprint
    panel)."""
    try:
        df = jolpica.sprint_results(year, round_num)
    except Exception as exc:
        log.warning("Jolpica sprint_results failed for %s R%s: %s", year, round_num, exc)
        df = pd.DataFrame()
    race_name = None
    if not df.empty and "race_name" in df.columns:
        race_name = str(df["race_name"].iloc[0])
    return ResultsResponse(
        season=year,
        round=round_num,
        race_name=race_name,
        kind="sprint",
        rows=_df_to_result_rows(df),
    )

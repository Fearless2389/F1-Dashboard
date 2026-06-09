"""
Jolpica F1 client — Ergast-compatible REST API for historical + current F1 data.

Source: https://github.com/jolpica/jolpica-f1
Base:   https://api.jolpi.ca/ergast/f1

Why we keep this alongside FastF1:
  - FastF1 caches *session* data (timing/telemetry) — great for replay.
  - Jolpica returns *aggregate* data (championship standings, schedules,
    finalised race results) which is faster and doesn't require re-running
    the whole ingestion pipeline.

We use it as:
  - The standings fallback when `data/processed/aligned_race_dataset.parquet`
    doesn't have the requested season yet.
  - The cheap path for "what races have happened this season".

All public functions return pandas DataFrames; failures return empty frames so
callers can degrade gracefully.
"""

import logging
import os
from typing import Optional

import httpx
import pandas as pd
from cachetools import TTLCache, cached

from .config import HTTP_TIMEOUT_S

log = logging.getLogger(__name__)

JOLPICA_BASE_URL = os.environ.get("JOLPICA_BASE_URL", "https://api.jolpi.ca/ergast/f1")

# Standings rarely change mid-week → 1h cache is plenty
_cache: TTLCache = TTLCache(maxsize=128, ttl=3600)


def _frozenset_key(*args, **kwargs):
    return (args, frozenset(kwargs.items()))


@cached(_cache, key=_frozenset_key)
def _get(path: str, **params) -> dict:
    """Single GET with retry + TTL cache."""
    url = f"{JOLPICA_BASE_URL}/{path.lstrip('/')}.json"
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_S) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as exc:
        log.warning("Jolpica GET %s failed: %s", path, exc)
        return {}


# ── Schedule ──────────────────────────────────────────────────────────────────

def season_schedule(season: int) -> pd.DataFrame:
    """Race schedule for a season (Ergast schema)."""
    data = _get(f"{season}")
    races = (
        data.get("MRData", {})
        .get("RaceTable", {})
        .get("Races", [])
    )
    if not races:
        return pd.DataFrame()
    out = []
    for r in races:
        out.append({
            "season":     int(r.get("season")),
            "round":      int(r.get("round")),
            "race_name":  r.get("raceName"),
            "circuit_id": (r.get("Circuit") or {}).get("circuitId"),
            "circuit_name": (r.get("Circuit") or {}).get("circuitName"),
            "country":    ((r.get("Circuit") or {}).get("Location") or {}).get("country"),
            "locality":   ((r.get("Circuit") or {}).get("Location") or {}).get("locality"),
            "date":       r.get("date"),
            "time":       r.get("time"),
        })
    return pd.DataFrame(out)


# ── Standings ─────────────────────────────────────────────────────────────────

def driver_standings(season: int, round_num: Optional[int] = None) -> pd.DataFrame:
    """
    Driver championship standings.
    `round_num` is optional — when present, standings AFTER that round.
    """
    path = f"{season}/driverStandings" if round_num is None \
        else f"{season}/{round_num}/driverStandings"
    data = _get(path)
    lists = (
        data.get("MRData", {})
        .get("StandingsTable", {})
        .get("StandingsLists", [])
    )
    if not lists:
        return pd.DataFrame()
    standings = lists[0].get("DriverStandings", [])
    rows = []
    for s in standings:
        drv = s.get("Driver", {})
        constructors = s.get("Constructors", [])
        team = constructors[0]["name"] if constructors else None
        rows.append({
            "championship_position": int(s.get("position")) if s.get("position") else None,
            "driver_code":   drv.get("code") or (drv.get("driverId") or "").upper()[:3],
            "driver_number": int(drv.get("permanentNumber")) if drv.get("permanentNumber") else None,
            "full_name":     f'{drv.get("givenName","")} {drv.get("familyName","")}'.strip(),
            "nationality":   drv.get("nationality"),
            "team_name":     team,
            "points":        float(s.get("points", 0)),
            "wins":          int(s.get("wins", 0)),
        })
    return pd.DataFrame(rows)


def constructor_standings(season: int, round_num: Optional[int] = None) -> pd.DataFrame:
    path = f"{season}/constructorStandings" if round_num is None \
        else f"{season}/{round_num}/constructorStandings"
    data = _get(path)
    lists = (
        data.get("MRData", {})
        .get("StandingsTable", {})
        .get("StandingsLists", [])
    )
    if not lists:
        return pd.DataFrame()
    standings = lists[0].get("ConstructorStandings", [])
    rows = []
    for s in standings:
        c = s.get("Constructor", {})
        rows.append({
            "constructor_position": int(s.get("position")) if s.get("position") else None,
            "team_name":   c.get("name"),
            "nationality": c.get("nationality"),
            "points":      float(s.get("points", 0)),
            "wins":        int(s.get("wins", 0)),
        })
    return pd.DataFrame(rows)


# ── Race results ──────────────────────────────────────────────────────────────

def last_race_result(season: int) -> pd.DataFrame:
    """Most-recently-completed race in `season`. Uses Jolpica's `last` keyword."""
    data = _get(f"{season}/last/results")
    return _parse_results(data)


def _parse_results(data: dict) -> pd.DataFrame:
    races = (
        data.get("MRData", {})
        .get("RaceTable", {})
        .get("Races", [])
    )
    rows = []
    for race in races:
        for r in race.get("Results", []):
            drv = r.get("Driver", {})
            con = r.get("Constructor", {})
            rows.append({
                "season":      int(race.get("season")),
                "round":       int(race.get("round")),
                "race_name":   race.get("raceName"),
                "circuit_id":  (race.get("Circuit") or {}).get("circuitId"),
                "date":        race.get("date"),
                "driver_code": drv.get("code") or (drv.get("driverId") or "").upper()[:3],
                "driver_number": int(drv.get("permanentNumber")) if drv.get("permanentNumber") else None,
                "team_name":   con.get("name"),
                "grid":        int(r.get("grid", 0)) if r.get("grid") else None,
                "position":    int(r.get("position")) if r.get("position") else None,
                "points":      float(r.get("points", 0)),
                "status":      r.get("status"),
                "laps":        int(r.get("laps", 0)) if r.get("laps") else None,
            })
    return pd.DataFrame(rows)


def race_results(season: int, round_num: Optional[int] = None) -> pd.DataFrame:
    """All races for a season, or a single race if round_num given.

    Jolpica/Ergast caps page size at 100, so a 20-driver × 24-race season
    (~480 rows) needs ~5 pages. We page through using `offset` until
    `MRData.total` is satisfied.
    """
    path = f"{season}/results" if round_num is None else f"{season}/{round_num}/results"
    rows: list[dict] = []
    offset = 0
    page_size = 100
    while True:
        data = _get(path, limit=page_size, offset=offset)
        mr = data.get("MRData", {})
        races = mr.get("RaceTable", {}).get("Races", [])
        page_rows = 0
        for race in races:
            for r in race.get("Results", []):
                drv = r.get("Driver", {})
                con = r.get("Constructor", {})
                rows.append({
                    "season":      int(race.get("season")),
                    "round":       int(race.get("round")),
                    "race_name":   race.get("raceName"),
                    "circuit_id":  (race.get("Circuit") or {}).get("circuitId"),
                    "driver_code": drv.get("code") or (drv.get("driverId") or "").upper()[:3],
                    "driver_number": int(drv.get("permanentNumber")) if drv.get("permanentNumber") else None,
                    "team_name":   con.get("name"),
                    "grid":        int(r.get("grid", 0)) if r.get("grid") else None,
                    "position":    int(r.get("position")) if r.get("position") else None,
                    "points":      float(r.get("points", 0)),
                    "status":      r.get("status"),
                    "laps":        int(r.get("laps", 0)) if r.get("laps") else None,
                })
                page_rows += 1

        try:
            total = int(mr.get("total", 0))
        except (TypeError, ValueError):
            total = 0
        offset += page_rows
        if page_rows == 0 or offset >= total:
            break
    return pd.DataFrame(rows)

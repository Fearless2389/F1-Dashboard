"""
OpenF1 REST client — wraps https://openf1.org/ endpoints.

Returns pandas DataFrames; caches responses for 5s via TTLCache.
All network errors are caught and surfaced as empty frames so callers
can degrade gracefully when offline.
"""

import logging
from typing import Any, Optional

import httpx
import pandas as pd
from cachetools import TTLCache, cached

from .config import HTTP_TIMEOUT_S, LIVE_CACHE_TTL_S, OPENF1_BASE_URL

log = logging.getLogger(__name__)

_cache: TTLCache = TTLCache(maxsize=256, ttl=LIVE_CACHE_TTL_S)


def _frozenset_key(*args, **kwargs):
    return (args, frozenset(kwargs.items()))


@cached(_cache, key=_frozenset_key)
def _get(endpoint: str, **params: Any) -> list[dict]:
    """GET an OpenF1 endpoint with retry + TTL cache."""
    url = f"{OPENF1_BASE_URL}/{endpoint}"
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_S) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as exc:
        log.warning("OpenF1 GET %s failed: %s", endpoint, exc)
        return []


def _as_frame(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


# ── Public endpoints ──────────────────────────────────────────────────────────

def get_sessions(year: Optional[int] = None,
                 session_key: Optional[int] = None) -> pd.DataFrame:
    """All sessions for a year, or a single session by key."""
    params: dict = {}
    if year is not None:
        params["year"] = year
    if session_key is not None:
        params["session_key"] = session_key
    return _as_frame(_get("sessions", **params))


def get_current_session() -> Optional[dict]:
    """The most recent session — may be live or just-completed."""
    rows = _get("sessions", session_key="latest")
    return rows[0] if rows else None


def get_drivers(session_key: int) -> pd.DataFrame:
    return _as_frame(_get("drivers", session_key=session_key))


def get_positions(session_key: int) -> pd.DataFrame:
    """Latest position per driver for a session."""
    rows = _get("position", session_key=session_key)
    df = _as_frame(rows)
    if df.empty:
        return df
    # Keep only the latest record per driver
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df.sort_values("date").groupby("driver_number", as_index=False).tail(1)


def get_intervals(session_key: int) -> pd.DataFrame:
    rows = _get("intervals", session_key=session_key)
    df = _as_frame(rows)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df.sort_values("date").groupby("driver_number", as_index=False).tail(1)


def get_laps(session_key: int, driver_number: Optional[int] = None) -> pd.DataFrame:
    params: dict = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    return _as_frame(_get("laps", **params))


def get_pit(session_key: int) -> pd.DataFrame:
    return _as_frame(_get("pit", session_key=session_key))


def get_stints(session_key: int) -> pd.DataFrame:
    return _as_frame(_get("stints", session_key=session_key))


def get_car_data(session_key: int, driver_number: int) -> pd.DataFrame:
    """Telemetry (~3.7Hz): speed, throttle, brake, gear, RPM, DRS."""
    return _as_frame(_get(
        "car_data",
        session_key=session_key,
        driver_number=driver_number,
    ))


def get_race_control(session_key: int) -> pd.DataFrame:
    """Flags, safety car, penalties."""
    return _as_frame(_get("race_control", session_key=session_key))


def get_weather(session_key: int) -> pd.DataFrame:
    return _as_frame(_get("weather", session_key=session_key))

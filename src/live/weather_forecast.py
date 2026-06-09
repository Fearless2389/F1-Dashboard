"""
Weather forecast via Open-Meteo (free, no API key).

Returns a 3-day hourly forecast for a given lat/lon.
Cached in-memory for 1h + persisted to data/schedule/weather_{circuit}.json.
"""

import json
import logging
from typing import Optional

import httpx
import pandas as pd
from cachetools import TTLCache, cached

from .config import (
    DATA_SCHEDULE,
    HTTP_TIMEOUT_S,
    OPEN_METEO_BASE_URL,
    WEATHER_CACHE_TTL_S,
)

log = logging.getLogger(__name__)

_cache: TTLCache = TTLCache(maxsize=64, ttl=WEATHER_CACHE_TTL_S)


@cached(_cache)
def fetch_forecast(lat: float, lon: float, hours: int = 72) -> pd.DataFrame:
    """3-day hourly forecast: temp, precipitation, wind, cloudcover."""
    url = f"{OPEN_METEO_BASE_URL}/forecast"
    params = {
        "latitude":  lat,
        "longitude": lon,
        "hourly":    "temperature_2m,precipitation,precipitation_probability,"
                     "windspeed_10m,cloudcover,relativehumidity_2m",
        "forecast_hours": hours,
        "timezone":  "UTC",
    }
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_S) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as exc:
        log.warning("Open-Meteo fetch failed: %s", exc)
        return pd.DataFrame()

    hourly = data.get("hourly", {})
    if not hourly:
        return pd.DataFrame()

    df = pd.DataFrame(hourly)
    df["time"] = pd.to_datetime(df["time"], errors="coerce", utc=True)

    # Persist to disk so the dashboard works offline
    try:
        path = DATA_SCHEDULE / f"weather_{lat:.2f}_{lon:.2f}.json"
        path.write_text(json.dumps(data))
    except Exception:
        pass

    return df


def race_window_summary(lat: float, lon: float,
                        race_start_iso: Optional[str] = None) -> dict:
    """
    Single-row weather summary for the race window.

    Returns:
        {
          "air_temp_mean": float,
          "rain_probability_max": float,
          "wind_speed_mean": float,
          "wet_race_likely": bool,
        }
    """
    df = fetch_forecast(lat, lon, hours=120)
    if df.empty:
        return {
            "air_temp_mean": None,
            "rain_probability_max": None,
            "wind_speed_mean": None,
            "wet_race_likely": False,
        }

    if race_start_iso:
        start = pd.to_datetime(race_start_iso, utc=True, errors="coerce")
        if pd.notna(start):
            end = start + pd.Timedelta(hours=3)
            window = df[(df["time"] >= start) & (df["time"] <= end)]
            if not window.empty:
                df = window

    return {
        "air_temp_mean":         float(df["temperature_2m"].mean()),
        "rain_probability_max":  float(df["precipitation_probability"].max())
                                 if "precipitation_probability" in df else None,
        "wind_speed_mean":       float(df["windspeed_10m"].mean()),
        "wet_race_likely":       bool(df["precipitation"].max() > 0.5)
                                 if "precipitation" in df else False,
    }

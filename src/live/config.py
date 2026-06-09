"""Config for the live data layer."""

import os
from pathlib import Path

from ..ingestion.config import ROOT

DATA_LIVE     = ROOT / "data" / "live"
DATA_SCHEDULE = ROOT / "data" / "schedule"

DATA_LIVE.mkdir(parents=True, exist_ok=True)
DATA_SCHEDULE.mkdir(parents=True, exist_ok=True)

CIRCUITS_FILE      = DATA_SCHEDULE / "circuits.csv"
CURRENT_SESSION_FILE = DATA_LIVE / "current_session.json"

OPENF1_BASE_URL = os.environ.get("OPENF1_BASE_URL", "https://api.openf1.org/v1")
OPEN_METEO_BASE_URL = os.environ.get("OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1")

HTTP_TIMEOUT_S    = 8.0
LIVE_CACHE_TTL_S  = 5
SCHEDULE_CACHE_TTL_S = 3600
WEATHER_CACHE_TTL_S  = 3600

LIVE_REFRESH_INTERVAL_S    = 5
SCHEDULE_REFRESH_INTERVAL_S = 3600

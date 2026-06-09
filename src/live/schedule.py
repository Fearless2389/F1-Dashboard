"""
Season schedule + circuit metadata.

`get_season_schedule(year)` wraps fastf1.get_event_schedule + caches result.
`get_circuits()` reads data/schedule/circuits.csv.
`upcoming_races(year)` returns rounds with race date >= today.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import fastf1
import pandas as pd
from cachetools import TTLCache, cached

from ..ingestion.config import CACHE_DIR, FASTF1_VERBOSITY
from .config import CIRCUITS_FILE, DATA_SCHEDULE, SCHEDULE_CACHE_TTL_S

log = logging.getLogger(__name__)

fastf1.Cache.enable_cache(str(CACHE_DIR))
fastf1.set_log_level(FASTF1_VERBOSITY)


_schedule_cache: TTLCache = TTLCache(maxsize=8, ttl=SCHEDULE_CACHE_TTL_S)


_LOCATION_MAP = {
    "sakhir": "bahrain", "bahrain": "bahrain",
    "jeddah": "jeddah", "saudi arabia": "jeddah",
    "melbourne": "melbourne", "albert park": "melbourne", "australian": "melbourne",
    "suzuka": "suzuka", "japanese": "suzuka",
    "shanghai": "shanghai", "chinese": "shanghai",
    "miami": "miami",
    "imola": "imola", "emilia romagna": "imola", "emilia-romagna": "imola",
    "monte carlo": "monaco", "monaco": "monaco", "monte-carlo": "monaco",
    "montreal": "montreal", "montréal": "montreal", "canadian": "montreal", "canada": "montreal",
    "catalunya": "barcelona", "barcelona": "barcelona", "spanish": "barcelona", "spain": "barcelona",
    "spielberg": "spielberg", "austrian": "spielberg", "austria": "spielberg",
    "silverstone": "silverstone", "british": "silverstone",
    "budapest": "hungaroring", "mogyoród": "hungaroring", "hungarian": "hungaroring",
    "spa-francorchamps": "spa", "spa": "spa", "belgian": "spa", "belgium": "spa",
    "zandvoort": "zandvoort", "dutch": "zandvoort",
    "monza": "monza", "italian": "monza", "italy": "monza",
    "baku": "baku", "azerbaijan": "baku",
    "marina bay": "singapore", "singapore": "singapore",
    "austin": "austin", "united states": "austin", "usa": "austin", "us": "austin",
    "mexico city": "mexico", "mexico": "mexico", "mexican": "mexico",
    "são paulo": "interlagos", "sao paulo": "interlagos", "interlagos": "interlagos",
    "brazilian": "interlagos", "brazil": "interlagos",
    "las vegas": "vegas",
    "lusail": "losail", "losail": "losail", "qatar": "losail",
    "yas island": "yas_marina", "yas marina": "yas_marina", "abu dhabi": "yas_marina",
}


def _normalize_circuit_id(name: str) -> str:
    """Map FastF1 location names → our circuits.csv ids."""
    if not isinstance(name, str):
        return ""
    n = name.lower().strip()
    # Strip common suffixes ("Bahrain Grand Prix" → "bahrain")
    for suffix in (" grand prix", " gp"):
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    if n in _LOCATION_MAP:
        return _LOCATION_MAP[n]
    # Try first word
    first = n.split()[0] if n else ""
    if first in _LOCATION_MAP:
        return _LOCATION_MAP[first]
    return n.replace(" ", "_")


@cached(_schedule_cache)
def get_season_schedule(year: int) -> pd.DataFrame:
    """Return events for `year` with normalized columns + circuit_id."""
    cache_path = DATA_SCHEDULE / f"{year}.parquet"

    try:
        sched = fastf1.get_event_schedule(year, include_testing=False)
    except Exception as exc:
        log.warning("FastF1 schedule for %d failed: %s", year, exc)
        if cache_path.exists():
            return pd.read_parquet(cache_path)
        return pd.DataFrame()

    out = pd.DataFrame({
        "season":      year,
        "round":       sched["RoundNumber"].astype(int),
        "race_name":   sched["EventName"].astype(str),
        "country":     sched["Country"].astype(str),
        "location":    sched["Location"].astype(str),
        "circuit_id":  sched["Location"].map(_normalize_circuit_id),
        "event_date":  pd.to_datetime(sched["EventDate"], errors="coerce", utc=True),
        "session5_date": pd.to_datetime(sched.get("Session5Date"), errors="coerce", utc=True),
    })

    try:
        out.to_parquet(cache_path, index=False)
    except Exception:
        pass
    return out


def get_circuits() -> pd.DataFrame:
    """Static circuit metadata (lap length, downforce, lat/lon, etc.)."""
    if not CIRCUITS_FILE.exists():
        log.warning("circuits.csv not found at %s", CIRCUITS_FILE)
        return pd.DataFrame()
    return pd.read_csv(CIRCUITS_FILE)


def upcoming_races(year: int, limit: Optional[int] = None) -> pd.DataFrame:
    """Rounds with race date >= today (UTC). Sorted ascending."""
    sched = get_season_schedule(year)
    if sched.empty:
        return sched

    now = pd.Timestamp.now(tz=timezone.utc)
    race_date = sched["session5_date"].fillna(sched["event_date"])
    future = sched[race_date >= now - pd.Timedelta(hours=3)].copy()
    future = future.sort_values("event_date")
    if limit is not None:
        future = future.head(limit)
    return future


def next_race(year: Optional[int] = None) -> Optional[dict]:
    """Single row for the very next race, or None if none upcoming."""
    if year is None:
        year = datetime.now(timezone.utc).year
    up = upcoming_races(year, limit=1)
    if up.empty:
        # Try next year
        up = upcoming_races(year + 1, limit=1)
    if up.empty:
        return None
    row = up.iloc[0].to_dict()
    return row


def enriched_schedule(year: int) -> pd.DataFrame:
    """Schedule joined with circuit metadata."""
    sched = get_season_schedule(year)
    if sched.empty:
        return sched
    circuits = get_circuits()
    if circuits.empty:
        return sched
    return sched.merge(circuits, on="circuit_id", how="left")

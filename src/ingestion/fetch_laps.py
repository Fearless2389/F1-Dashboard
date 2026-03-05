"""
Phase 1 — Lap Data Ingestion
Fetches lap-level data for all seasons (used for pace and strategy features).

Outputs:
    data/raw/lap_data.parquet

Usage:
    python -m src.ingestion.fetch_laps
    python -m src.ingestion.fetch_laps --seasons 2023 2024
    python -m src.ingestion.fetch_laps --resume
"""

import argparse
import logging

import fastf1
import pandas as pd
from tqdm import tqdm

from .config import (
    ALL_SEASONS,
    CACHE_DIR,
    FASTF1_VERBOSITY,
    LAP_DATA_FILE,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

fastf1.Cache.enable_cache(str(CACHE_DIR))
fastf1.set_log_level(FASTF1_VERBOSITY)

# Lap columns we extract (subset of FastF1 laps dataframe)
LAP_COLUMNS = [
    "Driver",
    "LapNumber",
    "LapTime",
    "Sector1Time",
    "Sector2Time",
    "Sector3Time",
    "Compound",
    "TyreLife",
    "Stint",
    "PitInTime",
    "PitOutTime",
    "IsAccurate",
    "TrackStatus",
]

RENAME_MAP = {
    "Driver":      "driver_code",
    "LapNumber":   "lap_number",
    "LapTime":     "lap_time_ms",
    "Sector1Time": "sector1_ms",
    "Sector2Time": "sector2_ms",
    "Sector3Time": "sector3_ms",
    "Compound":    "compound",
    "TyreLife":    "tyre_life",
    "Stint":       "stint",
    "PitInTime":   "pit_in_time",
    "PitOutTime":  "pit_out_time",
    "IsAccurate":  "is_accurate",
    "TrackStatus": "track_status",
}


def _td_to_ms(series: pd.Series) -> pd.Series:
    """Convert timedelta Series to float milliseconds. Handles NaT gracefully."""
    return pd.to_numeric(series.dt.total_seconds() * 1_000, errors="coerce")


def _extract_laps(session, season: int, round_num: int) -> pd.DataFrame | None:
    try:
        laps = session.laps.copy()

        # Keep only the columns we need (ignore missing ones gracefully)
        available = [c for c in LAP_COLUMNS if c in laps.columns]
        laps = laps[available].copy()
        laps.rename(columns=RENAME_MAP, inplace=True)

        # Convert timedelta columns to ms
        for col in ["lap_time_ms", "sector1_ms", "sector2_ms", "sector3_ms",
                    "pit_in_time", "pit_out_time"]:
            if col in laps.columns:
                laps[col] = _td_to_ms(laps[col])

        # Coerce numeric types
        laps["lap_number"] = pd.to_numeric(laps.get("lap_number"), errors="coerce").astype("Int16")
        laps["tyre_life"]  = pd.to_numeric(laps.get("tyre_life"),  errors="coerce").astype("Int8")
        laps["stint"]      = pd.to_numeric(laps.get("stint"),      errors="coerce").astype("Int8")
        laps["is_accurate"] = laps.get("is_accurate", pd.Series(False, index=laps.index)).astype(bool)

        laps.insert(0, "round",  round_num)
        laps.insert(0, "season", season)

        return laps

    except Exception as exc:
        log.warning(f"  Lap extraction failed: {exc}")
        return None


def fetch_laps(seasons: list[int], resume: bool = False) -> None:
    frames: list[pd.DataFrame] = []

    already_fetched: set[tuple] = set()
    if resume and LAP_DATA_FILE.exists():
        existing = pd.read_parquet(LAP_DATA_FILE, columns=["season", "round"])
        already_fetched = set(zip(existing["season"], existing["round"]))
        frames.append(pd.read_parquet(LAP_DATA_FILE))
        log.info(f"Resuming — {len(already_fetched)} rounds already cached")

    for season in seasons:
        log.info(f"── Season {season} ──────────────────────")
        try:
            schedule = fastf1.get_event_schedule(season, include_testing=False)
        except Exception as exc:
            log.error(f"  Could not load schedule for {season}: {exc}")
            continue

        for _, event in tqdm(schedule.iterrows(), total=len(schedule),
                             desc=f"{season} laps", unit="race"):
            round_num = int(event["RoundNumber"])

            if (season, round_num) in already_fetched:
                log.debug(f"  R{round_num} already fetched, skipping")
                continue

            log.info(f"  R{round_num:02d} {event['EventName']}")

            try:
                session = fastf1.get_session(season, round_num, "R")
                session.load(laps=True, weather=False, telemetry=False)

                lap_df = _extract_laps(session, season, round_num)
                if lap_df is not None:
                    frames.append(lap_df)
                    log.info(f"    {len(lap_df):,} laps extracted")

            except Exception as exc:
                log.warning(f"    Session load failed: {exc}")

    if not frames:
        log.warning("No lap data to save.")
        return

    df = pd.concat(frames, ignore_index=True)
    df.to_parquet(LAP_DATA_FILE, index=False)
    log.info(f"Saved {len(df):,} total lap rows → {LAP_DATA_FILE}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch F1 lap data via FastF1")
    parser.add_argument(
        "--seasons", nargs="+", type=int, default=ALL_SEASONS,
        help="Seasons to fetch (default: all seasons)"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Skip rounds already present in lap_data.parquet"
    )
    args = parser.parse_args()
    fetch_laps(seasons=args.seasons, resume=args.resume)

"""
Phase 1 — Session Ingestion
Fetches race results, qualifying results, and weather data for all seasons.

Outputs:
    data/raw/race_results.parquet
    data/raw/qualifying_results.parquet
    data/raw/weather_data.parquet

Usage:
    python -m src.ingestion.fetch_sessions
    python -m src.ingestion.fetch_sessions --seasons 2023 2024
    python -m src.ingestion.fetch_sessions --resume   # skip already-fetched rounds
"""

import argparse
import logging
from typing import Optional

import fastf1
import numpy as np
import pandas as pd
from tqdm import tqdm

from .config import (
    ALL_SEASONS,
    CACHE_DIR,
    FASTF1_VERBOSITY,
    QUALI_RESULTS_FILE,
    RACE_RESULTS_FILE,
    WEATHER_FILE,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

fastf1.Cache.enable_cache(str(CACHE_DIR))
fastf1.set_log_level(FASTF1_VERBOSITY)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _td_to_ms(series: pd.Series) -> pd.Series:
    """Convert a timedelta Series to float milliseconds."""
    return series.dt.total_seconds() * 1_000


def _get_schedule(season: int) -> pd.DataFrame:
    """Return event schedule, excluding pre-season tests."""
    schedule = fastf1.get_event_schedule(season, include_testing=False)
    return schedule


# ── Race results ─────────────────────────────────────────────────────────────

def _extract_race_results(session, season: int, round_num: int) -> Optional[pd.DataFrame]:
    try:
        results = session.results[
            ["Abbreviation", "DriverNumber", "TeamName",
             "GridPosition", "Position", "Status", "Points"]
        ].copy()

        results = results.rename(columns={
            "Abbreviation":  "driver_code",
            "DriverNumber":  "driver_number",
            "TeamName":      "team_name",
            "GridPosition":  "grid_position",
            "Position":      "finish_position",
            "Status":        "finish_status",
            "Points":        "points",
        })

        # Laps completed and total race time come from laps aggregation
        laps_per_driver = (
            session.laps.groupby("Driver")["LapNumber"]
            .max()
            .reset_index()
            .rename(columns={"Driver": "driver_code", "LapNumber": "laps_completed"})
        )
        results = results.merge(laps_per_driver, on="driver_code", how="left")

        # Race time: only meaningful for classified finishers
        if "Time" in session.results.columns:
            time_ms = _td_to_ms(session.results["Time"]).values
            results["race_time_ms"] = time_ms
        else:
            results["race_time_ms"] = np.nan

        results.insert(0, "round", round_num)
        results.insert(0, "season", season)
        results.insert(0, "circuit_id", session.event["Location"])
        results.insert(0, "race_name", session.event["EventName"])

        # Coerce types
        results["driver_number"]  = pd.to_numeric(results["driver_number"],  errors="coerce").astype("Int8")
        results["grid_position"]  = pd.to_numeric(results["grid_position"],  errors="coerce").astype("Int8")
        results["finish_position"] = pd.to_numeric(results["finish_position"], errors="coerce").astype("Float32")
        results["points"]         = pd.to_numeric(results["points"],         errors="coerce").astype("Float32")
        results["laps_completed"] = pd.to_numeric(results["laps_completed"], errors="coerce").astype("Int16")

        return results

    except Exception as exc:
        log.warning(f"  Race results extraction failed: {exc}")
        return None


# ── Qualifying results ────────────────────────────────────────────────────────

def _extract_quali_results(session, season: int, round_num: int) -> Optional[pd.DataFrame]:
    try:
        results = session.results[
            ["Abbreviation", "TeamName", "Q1", "Q2", "Q3", "Position"]
        ].copy()

        results = results.rename(columns={
            "Abbreviation": "driver_code",
            "TeamName":     "team_name",
            "Position":     "quali_position",
        })

        results["q1_time_ms"] = _td_to_ms(results["Q1"])
        results["q2_time_ms"] = _td_to_ms(results["Q2"])
        results["q3_time_ms"] = _td_to_ms(results["Q3"])
        results.drop(columns=["Q1", "Q2", "Q3"], inplace=True)

        results.insert(0, "round", round_num)
        results.insert(0, "season", season)

        results["quali_position"] = pd.to_numeric(results["quali_position"], errors="coerce").astype("Int8")

        return results

    except Exception as exc:
        log.warning(f"  Qualifying results extraction failed: {exc}")
        return None


# ── Weather ───────────────────────────────────────────────────────────────────

def _extract_weather(session, season: int, round_num: int) -> Optional[pd.DataFrame]:
    try:
        w = session.weather_data
        if w is None or w.empty:
            return None

        row = {
            "season":           season,
            "round":            round_num,
            "air_temp_mean":    float(w["AirTemp"].mean()),
            "track_temp_mean":  float(w["TrackTemp"].mean()),
            "humidity_mean":    float(w["Humidity"].mean()),
            "wind_speed_mean":  float(w["WindSpeed"].mean()),
            "rainfall":         bool(w["Rainfall"].any()),
        }
        return pd.DataFrame([row])

    except Exception as exc:
        log.warning(f"  Weather extraction failed: {exc}")
        return None


# ── Main fetch loop ───────────────────────────────────────────────────────────

def fetch_all(seasons: list[int], resume: bool = False) -> None:
    """
    Iterate over seasons × rounds, load sessions, extract and accumulate data.
    Saves three parquet files on completion.
    """
    race_frames:  list[pd.DataFrame] = []
    quali_frames: list[pd.DataFrame] = []
    weather_frames: list[pd.DataFrame] = []

    # Load existing data if resuming
    if resume:
        if RACE_RESULTS_FILE.exists():
            race_frames.append(pd.read_parquet(RACE_RESULTS_FILE))
            log.info(f"Resuming — loaded {len(race_frames[0])} existing race rows")
        if QUALI_RESULTS_FILE.exists():
            quali_frames.append(pd.read_parquet(QUALI_RESULTS_FILE))
        if WEATHER_FILE.exists():
            weather_frames.append(pd.read_parquet(WEATHER_FILE))

    already_fetched: set[tuple] = set()
    if resume and race_frames:
        already_fetched = set(
            zip(race_frames[0]["season"], race_frames[0]["round"])
        )

    for season in seasons:
        log.info(f"── Season {season} ──────────────────────")
        try:
            schedule = _get_schedule(season)
        except Exception as exc:
            log.error(f"  Could not load schedule for {season}: {exc}")
            continue

        for _, event in tqdm(schedule.iterrows(), total=len(schedule),
                             desc=f"{season}", unit="race"):
            round_num = int(event["RoundNumber"])

            if (season, round_num) in already_fetched:
                log.debug(f"  {season} R{round_num} already fetched, skipping")
                continue

            race_name = event["EventName"]
            log.info(f"  R{round_num:02d} {race_name}")

            # ── Race session ──────────────────────────────────────────────
            try:
                race_session = fastf1.get_session(season, round_num, "R")
                race_session.load(laps=True, weather=True, telemetry=False)

                race_df = _extract_race_results(race_session, season, round_num)
                if race_df is not None:
                    race_frames.append(race_df)

                weather_df = _extract_weather(race_session, season, round_num)
                if weather_df is not None:
                    weather_frames.append(weather_df)

            except Exception as exc:
                log.warning(f"    Race session load failed: {exc}")

            # ── Qualifying session ────────────────────────────────────────
            try:
                quali_session = fastf1.get_session(season, round_num, "Q")
                quali_session.load(laps=False, weather=False, telemetry=False)

                quali_df = _extract_quali_results(quali_session, season, round_num)
                if quali_df is not None:
                    quali_frames.append(quali_df)

            except Exception as exc:
                log.warning(f"    Qualifying session load failed: {exc}")

    # ── Save ──────────────────────────────────────────────────────────────────
    _save(race_frames,    RACE_RESULTS_FILE,   "race results")
    _save(quali_frames,   QUALI_RESULTS_FILE,  "qualifying results")
    _save(weather_frames, WEATHER_FILE,         "weather")


def _save(frames: list[pd.DataFrame], path, label: str) -> None:
    if not frames:
        log.warning(f"No {label} data to save.")
        return
    df = pd.concat(frames, ignore_index=True)
    df.to_parquet(path, index=False)
    log.info(f"Saved {len(df):,} {label} rows → {path}")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch F1 session data via FastF1")
    parser.add_argument(
        "--seasons", nargs="+", type=int, default=ALL_SEASONS,
        help="Seasons to fetch (default: all training/val/test seasons)"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Skip rounds already present in the output files"
    )
    args = parser.parse_args()
    fetch_all(seasons=args.seasons, resume=args.resume)

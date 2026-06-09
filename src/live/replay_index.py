"""
Build a per-race index of every replayable session in the FastF1 cache.

Writes `data/processed/replay_index.parquet` with one row per race we can
replay. The index lets `GET /api/replay` answer instantly without re-scanning
hundreds of pickle files.

Run once after first ingest (or whenever you add new seasons):
    python -m src.live.replay_index
"""

from __future__ import annotations

import logging
import pickle
import re
from pathlib import Path

import pandas as pd

from ..ingestion.config import CACHE_DIR, DATA_PROCESSED, RACE_RESULTS_FILE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

REPLAY_INDEX_FILE = DATA_PROCESSED / "replay_index.parquet"


_FOLDER_RE = re.compile(r"^(?P<date>\d{4}-\d{2}-\d{2})_(?P<slug>.+)$")


def _scan_cache() -> list[dict]:
    """Walk the FastF1 cache, return one row per `_extended_timing_data.ff1pkl` found in a Race folder."""
    rows = []
    if not CACHE_DIR.exists():
        log.warning("Cache dir not found: %s", CACHE_DIR)
        return rows

    for year_dir in sorted(CACHE_DIR.glob("[0-9][0-9][0-9][0-9]")):
        try:
            year = int(year_dir.name)
        except ValueError:
            continue
        for event_dir in sorted(year_dir.iterdir()):
            if not event_dir.is_dir():
                continue
            m = _FOLDER_RE.match(event_dir.name)
            if not m:
                continue
            event_date = m.group("date")
            event_slug = m.group("slug")  # e.g. "Bahrain_Grand_Prix"
            # Find the Race session folder
            race_session = next(
                (d for d in event_dir.iterdir() if d.is_dir() and d.name.endswith("_Race")),
                None,
            )
            if race_session is None:
                continue
            pkl = race_session / "_extended_timing_data.ff1pkl"
            if not pkl.exists():
                continue
            rows.append({
                "season":      year,
                "event_date":  event_date,
                "event_slug":  event_slug,
                "cache_path":  str(pkl.resolve()),
            })
    return rows


def _race_name_from_slug(slug: str) -> str:
    """Bahrain_Grand_Prix → Bahrain Grand Prix."""
    return slug.replace("_", " ")


def _match_round(year: int, race_name: str, results: pd.DataFrame) -> dict | None:
    """Look up the round number + circuit id for a (season, race_name) pair."""
    sub = results[(results["season"] == year)]
    if sub.empty:
        return None
    # Direct match first
    hit = sub[sub["race_name"].str.lower() == race_name.lower()]
    if hit.empty:
        # Substring fallback (e.g. "São Paulo" vs "Sao Paulo")
        hit = sub[
            sub["race_name"].str.lower().str.contains(race_name.split()[0].lower(), na=False)
        ]
    if hit.empty:
        return None
    row = hit.drop_duplicates("round").iloc[0]
    return {
        "round":       int(row["round"]),
        "race_name":   str(row["race_name"]),
        "circuit_id":  str(row.get("circuit_id") or ""),
    }


def _n_laps(pkl_path: str) -> int | None:
    """Open a single pickle and read the max NumberOfLaps."""
    try:
        with open(pkl_path, "rb") as f:
            raw = pickle.load(f)
        df = raw["data"][0]
        if "NumberOfLaps" in df.columns:
            return int(pd.to_numeric(df["NumberOfLaps"], errors="coerce").max())
    except Exception as exc:
        log.warning("Could not read laps from %s: %s", pkl_path, exc)
    return None


def build_index() -> pd.DataFrame:
    """Scan cache, join against race_results, return the replay index."""
    scanned = _scan_cache()
    if not scanned:
        log.warning("No cached races found at %s", CACHE_DIR)
        return pd.DataFrame()

    if RACE_RESULTS_FILE.exists():
        results = pd.read_parquet(RACE_RESULTS_FILE)
    else:
        log.warning("race_results.parquet not found — round/circuit_id will be missing")
        results = pd.DataFrame(columns=["season", "round", "race_name", "circuit_id"])

    rows = []
    for entry in scanned:
        race_name = _race_name_from_slug(entry["event_slug"])
        match = _match_round(entry["season"], race_name, results)
        if match is None:
            log.debug("No race_results row for %s %s", entry["season"], race_name)
            continue
        laps = _n_laps(entry["cache_path"])
        if laps is None or laps < 5:
            continue
        rows.append({
            "season":      entry["season"],
            "round":       match["round"],
            "race_name":   match["race_name"],
            "circuit_id":  match["circuit_id"],
            "event_date":  entry["event_date"],
            "n_laps":      laps,
            "cache_path":  entry["cache_path"],
        })

    index = (
        pd.DataFrame(rows)
        .drop_duplicates(["season", "round"])
        .sort_values(["season", "round"])
        .reset_index(drop=True)
    )
    return index


def write_index() -> None:
    index = build_index()
    if index.empty:
        log.error("Index is empty — nothing written.")
        return
    REPLAY_INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    index.to_parquet(REPLAY_INDEX_FILE, index=False)
    log.info(
        "Wrote %d replayable races (%d–%d) → %s",
        len(index),
        int(index["season"].min()),
        int(index["season"].max()),
        REPLAY_INDEX_FILE,
    )


def load_index() -> pd.DataFrame:
    """Convenience reader used by the API."""
    if not REPLAY_INDEX_FILE.exists():
        return pd.DataFrame()
    return pd.read_parquet(REPLAY_INDEX_FILE)


if __name__ == "__main__":
    write_index()

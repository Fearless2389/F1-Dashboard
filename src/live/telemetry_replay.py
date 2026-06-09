"""
Per-tick telemetry loader for race replays.

The FastF1 cache pickles `car_data.ff1pkl` per session — one DataFrame per
driver with columns [Time, Date, RPM, Speed, nGear, Throttle, Brake, DRS,
Source] sampled at ~10 Hz. We downsample to 5 Hz at load time (~25k rows per
driver) and serve narrow session-time windows to the frontend telemetry mini-
window. Mirrors `src/live/replay.py:_load_aux_pickles` for the cache I/O.
"""

from __future__ import annotations

import logging
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from .replay_index import load_index

log = logging.getLogger(__name__)


def _td_to_seconds(v) -> Optional[float]:
    if v is None or pd.isna(v):
        return None
    if isinstance(v, pd.Timedelta):
        return v.total_seconds()
    try:
        return pd.Timedelta(v).total_seconds()
    except Exception:
        return None


@lru_cache(maxsize=8)
def load_telemetry(season: int, round_num: int) -> Optional[dict[str, pd.DataFrame]]:
    """Open `car_data.ff1pkl` for (season, round) and return a per-driver
    table keyed by driver_code, downsampled to 5 Hz.

    Returns `None` if telemetry was never fetched for that race (older 2024
    and earlier caches were loaded with `telemetry=False` and don't have
    the pickle).
    """
    index = load_index()
    if index.empty:
        return None
    row = index[(index["season"] == season) & (index["round"] == round_num)]
    if row.empty:
        return None
    row = row.iloc[0]

    # cache_path in the index points at _extended_timing_data.ff1pkl; the
    # car_data pickle lives in the same session folder.
    timing_pkl = Path(row["cache_path"])
    car_pkl = timing_pkl.parent / "car_data.ff1pkl"
    if not car_pkl.exists():
        log.info("Telemetry not cached for %s R%s (%s)", season, round_num, car_pkl)
        return None

    try:
        with open(car_pkl, "rb") as f:
            raw = pickle.load(f)
    except Exception as exc:
        log.warning("Could not parse %s: %s", car_pkl, exc)
        return None

    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        log.warning("Unexpected car_data structure in %s", car_pkl)
        return None

    # Resolve driver_number → driver_code using the race-results meta we
    # already build inside replay.py. We avoid a circular import by reading
    # the parquet directly here.
    from ..ingestion.config import RACE_RESULTS_FILE
    code_by_num: dict[str, str] = {}
    if RACE_RESULTS_FILE.exists():
        rr = pd.read_parquet(RACE_RESULTS_FILE)
        sub = rr[(rr["season"] == season) & (rr["round"] == round_num)]
        for _, r in sub.iterrows():
            num = r.get("driver_number")
            if pd.isna(num):
                continue
            code = str(r.get("driver_code") or "")
            if code:
                code_by_num[str(int(num))] = code

    out: dict[str, pd.DataFrame] = {}
    for drv_num, df in data.items():
        if not isinstance(df, pd.DataFrame) or df.empty:
            continue
        drv_num_str = str(drv_num)
        code = code_by_num.get(drv_num_str, drv_num_str)
        df = df.copy()
        df["_t"] = df["Time"].apply(_td_to_seconds)
        df = df.dropna(subset=["_t"]).sort_values("_t")
        if df.empty:
            continue

        # Downsample to 5 Hz by binning on session-time seconds × 5.
        # Resampling via groupby is faster than pandas .resample on a non-
        # datetime index for this dataset.
        df["_bin"] = (df["_t"] * 5).round().astype(int)
        df = df.drop_duplicates(subset=["_bin"], keep="first")

        compact = pd.DataFrame({
            "t":        df["_t"].to_numpy(dtype=np.float32),
            "speed":    pd.to_numeric(df.get("Speed"),    errors="coerce").fillna(0).astype(np.int16).to_numpy(),
            "throttle": pd.to_numeric(df.get("Throttle"), errors="coerce").fillna(0).astype(np.int16).to_numpy(),
            "brake":    df.get("Brake").fillna(False).astype(bool).to_numpy() if "Brake" in df.columns else np.zeros(len(df), dtype=bool),
            "gear":     pd.to_numeric(df.get("nGear"),    errors="coerce").fillna(0).astype(np.int16).to_numpy(),
            "drs":      pd.to_numeric(df.get("DRS"),      errors="coerce").fillna(0).astype(np.int16).to_numpy(),
        })
        out[code] = compact

    return out


def telemetry_window(season: int, round_num: int, driver_code: str,
                     from_t: float, to_t: float) -> Optional[dict]:
    """Return a session-time slice for one driver.

    Output shape (parallel arrays, columnar — smallest over the wire):
        {
          "driver_code": str,
          "from_t": float, "to_t": float,
          "t":        [float, ...],   # session-seconds, 5 Hz
          "speed":    [int,   ...],   # km/h
          "throttle": [int,   ...],   # 0..100
          "brake":    [bool,  ...],   # on/off (cast int 0/1 on emit)
          "gear":     [int,   ...],   # 1..8
          "drs":      [int,   ...],   # raw FastF1 code (10/12/14 = active)
        }

    Returns `None` if no telemetry pickled for this race.
    """
    cache = load_telemetry(season, round_num)
    if cache is None:
        return None

    df = cache.get(driver_code)
    if df is None or df.empty:
        # Driver might be absent (reserve) — return empty payload (200, just empty arrays).
        return {
            "driver_code": driver_code,
            "from_t": from_t, "to_t": to_t,
            "t": [], "speed": [], "throttle": [], "brake": [], "gear": [], "drs": [],
        }

    t = df["t"].to_numpy()
    lo = int(np.searchsorted(t, from_t, side="left"))
    hi = int(np.searchsorted(t, to_t,   side="right"))
    sl = df.iloc[lo:hi]

    return {
        "driver_code": driver_code,
        "from_t":      float(from_t),
        "to_t":        float(to_t),
        "t":           [round(float(x), 2) for x in sl["t"].tolist()],
        "speed":       [int(x) for x in sl["speed"].tolist()],
        "throttle":    [int(x) for x in sl["throttle"].tolist()],
        "brake":       [bool(x) for x in sl["brake"].tolist()],
        "gear":        [int(x) for x in sl["gear"].tolist()],
        "drs":         [int(x) for x in sl["drs"].tolist()],
    }

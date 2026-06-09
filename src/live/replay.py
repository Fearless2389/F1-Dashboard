"""
Race replay parser — reads a FastF1 cached `_extended_timing_data.ff1pkl`
and exposes per-lap snapshots in the same shape as the live WebSocket payload.

Public API:
    load_race(season, round) -> Replay
    Replay.snapshot(lap_n: int) -> dict   # LiveSnapshot-shaped
    Replay.meta() -> dict                  # race metadata for /api/replay/{s}/{r}

Lap-N snapshots are derived from the cached timing dataframe:
    raw["data"][0] — per-driver per-lap timing rows
    raw["data"][1] — session-time position history
"""

from __future__ import annotations

import bisect
import logging
import pickle
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from ..ingestion.config import LAP_DATA_FILE, RACE_RESULTS_FILE
from .replay_index import load_index
from .schedule import _normalize_circuit_id

log = logging.getLogger(__name__)


# FastF1 track-status integer codes → our enum
_TRACK_STATUS_MAP = {
    1: "AllClear",
    2: "Yellow",
    3: "Yellow",       # rare — sector-yellow per FastF1
    4: "SC",
    5: "Red",
    6: "VSC",
    7: "VSC",          # VSC ending — treat same for UI
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _td_to_seconds(v) -> Optional[float]:
    if v is None or pd.isna(v):
        return None
    if isinstance(v, pd.Timedelta):
        return v.total_seconds()
    try:
        return pd.Timedelta(v).total_seconds()
    except Exception:
        return None


def _ms_to_seconds(v) -> Optional[float]:
    """Convert a millisecond-valued column (lap_data uses these) to seconds.
    `lap_data.parquet` stores `lap_time_ms`, `pit_in_time`, `pit_out_time` as
    raw float milliseconds, NOT pandas Timedeltas — `_td_to_seconds` would
    misinterpret them as nanoseconds."""
    if v is None or pd.isna(v):
        return None
    try:
        return float(v) / 1000.0
    except Exception:
        return None


def _format_gap(secs: Optional[float]) -> Optional[str]:
    if secs is None or pd.isna(secs):
        return None
    if secs >= 60:
        m = int(secs // 60); s = secs - m * 60
        return f"+{m}:{s:06.3f}"
    return f"+{secs:.3f}"


# ── Per-race result lookups ───────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _race_results() -> pd.DataFrame:
    """Race-results parquet, used for driver_code / team_name / number resolution."""
    if RACE_RESULTS_FILE.exists():
        return pd.read_parquet(RACE_RESULTS_FILE)
    return pd.DataFrame()


def _driver_meta(season: int, round_num: int) -> dict[str, dict]:
    """Map driver_number (str) → {driver_code, team_name, full_name, finish_position}."""
    rr = _race_results()
    if rr.empty:
        return {}
    sub = rr[(rr["season"] == season) & (rr["round"] == round_num)]
    out: dict[str, dict] = {}
    for _, row in sub.iterrows():
        num = row.get("driver_number")
        if pd.isna(num):
            continue
        key = str(int(num))
        out[key] = {
            "driver_number":   int(num),
            "driver_code":     str(row.get("driver_code") or ""),
            "team_name":       str(row.get("team_name") or ""),
            "finish_position": int(row["finish_position"]) if pd.notna(row.get("finish_position")) else None,
            "grid_position":   int(row["grid_position"]) if pd.notna(row.get("grid_position")) else None,
        }
    return out


@lru_cache(maxsize=1)
def _all_lap_data() -> pd.DataFrame:
    """Load lap_data.parquet once; cheap to filter per-race afterwards."""
    if LAP_DATA_FILE.exists():
        return pd.read_parquet(LAP_DATA_FILE)
    return pd.DataFrame()


def _lap_data_for_race(season: int, round_num: int) -> pd.DataFrame:
    df = _all_lap_data()
    if df.empty:
        return df
    return df[(df["season"] == season) & (df["round"] == round_num)].copy()


def _load_aux_pickles(cache_path: Path) -> dict:
    """Load track_status_data.ff1pkl and race_control_messages.ff1pkl from the
    same race-session folder as the timing pickle. Returns dict with the
    parsed DataFrames (or empty DataFrames when files are missing)."""
    folder = cache_path.parent
    out: dict[str, pd.DataFrame] = {"track_status": pd.DataFrame(), "race_control": pd.DataFrame()}
    for key, fname in [("track_status", "track_status_data.ff1pkl"),
                       ("race_control", "race_control_messages.ff1pkl")]:
        p = folder / fname
        if not p.exists():
            continue
        try:
            with open(p, "rb") as fh:
                raw = pickle.load(fh)
            data = raw.get("data") if isinstance(raw, dict) else None
            if isinstance(data, dict):
                df = pd.DataFrame(data)
            elif hasattr(data, "to_dict"):
                df = data
            else:
                df = pd.DataFrame()
            out[key] = df
        except Exception as exc:
            log.warning("Could not parse %s: %s", p, exc)
    return out


# ── Replay core ───────────────────────────────────────────────────────────────

@dataclass
class Replay:
    season: int
    round: int
    race_name: str
    circuit_id: str
    n_laps: int
    timing_df: pd.DataFrame                 # raw["data"][0]
    position_df: pd.DataFrame               # raw["data"][1]
    drivers_meta: dict[str, dict]           # driver_number → meta
    track_status_df: pd.DataFrame = field(default_factory=pd.DataFrame)  # FastF1 track status
    lap_data_df: pd.DataFrame = field(default_factory=pd.DataFrame)      # per-lap compound/stint

    # ── Helpers ──────────────────────────────────────────────────────────────

    def track_status_at(self, secs: float) -> str:
        """Most recent status string (mapped to our enum) at session-time `secs`."""
        if self.track_status_df is None or self.track_status_df.empty:
            return "AllClear"
        df = self.track_status_df.copy()
        df["_secs"] = df["Time"].apply(_td_to_seconds) if "Time" in df.columns else None
        df = df.dropna(subset=["_secs"])
        active = df[df["_secs"] <= secs]
        if active.empty:
            return "AllClear"
        last_status = active.sort_values("_secs").iloc[-1]
        code = last_status.get("Status")
        try:
            code = int(code)
        except (TypeError, ValueError):
            return "AllClear"
        return _TRACK_STATUS_MAP.get(code, "AllClear")

    def tyre_lookup(self, driver_code: str, lap_n: int) -> dict:
        """Compound + tyre_age + stint for a driver on lap_n. Empty dict if unknown."""
        if self.lap_data_df is None or self.lap_data_df.empty:
            return {}
        sub = self.lap_data_df[
            (self.lap_data_df["driver_code"] == driver_code)
            & (self.lap_data_df["lap_number"] <= lap_n)
        ]
        if sub.empty:
            return {}
        row = sub.sort_values("lap_number").iloc[-1]
        compound = row.get("compound")
        if isinstance(compound, str) and compound.lower() in ("nan", "none", "unknown", ""):
            compound = None
        return {
            "compound":  compound,
            "tyre_life": int(row["tyre_life"]) if pd.notna(row.get("tyre_life")) else None,
            "stint":     int(row["stint"]) if pd.notna(row.get("stint")) else None,
        }

    # ── Snapshot at a given lap ───────────────────────────────────────────────

    def snapshot(self, lap_n: int) -> dict:
        """Return a LiveSnapshot-shaped dict at the moment the leader crosses
        the line to complete `lap_n`.

        For each driver we report `lap_progress` (0..1) — where they are on
        their current lap at that exact session time. The TrackMap uses this
        to place dots at their real instantaneous position on the racing line.
        """
        lap_n = max(1, min(self.n_laps, int(lap_n)))

        t = self.timing_df.copy()
        t["NumberOfLaps"] = pd.to_numeric(t["NumberOfLaps"], errors="coerce").fillna(0).astype(int)
        t["_end_secs"] = t["Sector3SessionTime"].apply(_td_to_seconds)

        # 1) Leader's lap_n completion time
        leader_rows = t[(t["NumberOfLaps"] == lap_n) & t["_end_secs"].notna()]
        if leader_rows.empty:
            return self._empty_snapshot()
        leader_secs = float(leader_rows["_end_secs"].min())

        # 2) Per-driver median lap time (used to estimate progress between sector marks)
        avg_lap_per_driver: dict[str, float] = {}
        for drv, sub in t.groupby("Driver", sort=False):
            laps = sub["LapTime"].apply(_td_to_seconds).dropna()
            if len(laps) > 0:
                avg_lap_per_driver[str(drv)] = float(laps.median())

        # 3) For each driver, find their last completed lap at or before leader_secs
        per_driver: list[dict] = []
        for drv, sub in t.groupby("Driver", sort=False):
            done = sub[(sub["_end_secs"].notna()) & (sub["_end_secs"] <= leader_secs)]
            if done.empty:
                # Hasn't even completed lap 1 yet — show them at race start
                base_row = sub.iloc[0]
                last_lap = 0
                last_secs = 0.0
            else:
                last = done.sort_values("_end_secs").iloc[-1]
                base_row = last
                last_lap = int(last["NumberOfLaps"])
                last_secs = float(last["_end_secs"])

            avg = avg_lap_per_driver.get(str(drv), 90.0)
            elapsed = max(0.0, leader_secs - last_secs)
            # Drivers stay strictly < 1.0 (they haven't crossed line yet for next lap)
            progress = float(min(0.999, elapsed / avg)) if avg > 0 else 0.0
            race_progress = last_lap + progress

            per_driver.append({
                "drv":            str(drv),
                "last_lap":       last_lap,
                "lap_progress":   progress,
                "race_progress":  race_progress,
                "row":            base_row,
            })

        # 4) Rank by total race progress (descending = ahead)
        per_driver.sort(key=lambda x: -x["race_progress"])

        # 5) Build driver output objects
        leader_race_prog = per_driver[0]["race_progress"] if per_driver else 0
        drivers_out = []
        prev_progress = None
        for pos, d in enumerate(per_driver, start=1):
            row = d["row"]
            drv_num_str = d["drv"]
            meta = self.drivers_meta.get(drv_num_str, {})
            avg = avg_lap_per_driver.get(drv_num_str, 90.0)

            # Gap to leader in seconds = progress diff × average lap
            prog_diff_leader = leader_race_prog - d["race_progress"]
            gap_leader = prog_diff_leader * avg if prog_diff_leader > 0 else 0
            prog_diff_interval = (prev_progress - d["race_progress"]) if prev_progress is not None else None
            interval = (prog_diff_interval * avg) if (prog_diff_interval and prog_diff_interval > 0) else None
            prev_progress = d["race_progress"]

            lap_time_secs = _td_to_seconds(row.get("LapTime"))
            speed_st = row.get("SpeedST")
            pits = int(row["NumberOfPitStops"]) if pd.notna(row.get("NumberOfPitStops")) else 0
            driver_code = meta.get("driver_code") or drv_num_str

            # Compound + tyre age from lap_data.parquet (joined per-driver, per-lap)
            tyre = self.tyre_lookup(driver_code, d["last_lap"]) if d["last_lap"] > 0 else {}

            drivers_out.append({
                "driver_number":  meta.get("driver_number") or (int(drv_num_str) if drv_num_str.isdigit() else None),
                "driver_code":    driver_code,
                "full_name":      driver_code,
                "team_name":      meta.get("team_name") or "",
                "team_colour":    None,
                "headshot_url":   None,
                "position":       pos,
                "gap_to_leader":  _format_gap(gap_leader) if pos > 1 else "LEADER",
                "interval":       _format_gap(interval) if pos > 1 else None,
                "compound":       tyre.get("compound"),
                "stint_number":   tyre.get("stint") or (pits + 1),
                "lap_start":      d["last_lap"],
                "pit_count":      pits,
                "lap_time":       f"{lap_time_secs:.3f}" if lap_time_secs else None,
                "top_speed":      float(speed_st) if pd.notna(speed_st) else None,
                "lap_progress":   d["lap_progress"],
                "tyre_life":      tyre.get("tyre_life"),
            })

        return {
            "session_key":         None,
            "session_name":        "Race",
            "session_type":        "Race",
            "circuit_short_name":  self.circuit_id,
            "country_name":        None,
            "year":                self.season,
            "status":              "Replay",
            "fetched_at":          pd.Timestamp.utcnow().isoformat(),
            "track_status":        self.track_status_at(leader_secs),
            "drivers":             drivers_out,
            "race_control":        [],
            "weather":             {
                "air_temperature": None, "track_temperature": None,
                "humidity": None, "wind_speed": None, "rainfall": False,
            },
            # Replay-only top-level meta
            "replay": {
                "season": self.season,
                "round":  self.round,
                "lap":    int(lap_n),
                "n_laps": self.n_laps,
            },
        }

    def _empty_snapshot(self) -> dict:
        return {
            "session_key": None, "session_name": "Race", "session_type": "Race",
            "circuit_short_name": self.circuit_id, "country_name": None,
            "year": self.season, "status": "Replay",
            "fetched_at": pd.Timestamp.utcnow().isoformat(),
            "drivers": [], "race_control": [],
            "weather": {
                "air_temperature": None, "track_temperature": None,
                "humidity": None, "wind_speed": None, "rainfall": False,
            },
            "replay": {"season": self.season, "round": self.round, "lap": 0, "n_laps": self.n_laps},
        }

    # ── Overtakes ────────────────────────────────────────────────────────────

    def _compute_overtakes(self) -> list[dict]:
        """
        Scan position_df for rank swaps. Each row is a position-change event;
        we group by time-bucket (within 1 second) so we can detect pairs that
        swapped at the same moment.
        """
        if self.position_df is None or self.position_df.empty:
            return []

        df = self.position_df.copy()
        df["secs"] = df["Time"].apply(_td_to_seconds)
        df["Position"] = pd.to_numeric(df["Position"], errors="coerce")
        df = df.dropna(subset=["secs", "Position"])
        df["Driver"] = df["Driver"].astype(str)

        # Build prev_position per driver (in time order) so we know when each row was a change.
        df = df.sort_values(["Driver", "secs"])
        df["prev_pos"] = df.groupby("Driver")["Position"].shift(1)
        df = df.dropna(subset=["prev_pos"])
        # Only keep ROW where Position decreased (driver moved UP = overtook)
        moves_up = df[df["Position"] < df["prev_pos"]].copy()
        if moves_up.empty:
            return []

        # For each rise event, the driver overtaken = whoever was holding the
        # NEW position just before this timestamp. Approximate by finding the
        # nearest row (in time) for that position.
        df_sorted = df.sort_values("secs")
        pos_by_time: dict[int, list[tuple[float, str]]] = {}
        for _, r in df_sorted.iterrows():
            pos_by_time.setdefault(int(r["Position"]), []).append((float(r["secs"]), str(r["Driver"])))

        # Estimate lap number from position_df ordering — total laps known
        leader_total_secs: list[tuple[float, int]] = []
        leader_rows = df_sorted[df_sorted["Position"] == 1].sort_values("secs")
        if not leader_rows.empty:
            # Build "secs → lap" using the timing_df leader laps
            try:
                tlead = self.timing_df.copy()
                tlead["NumberOfLaps"] = pd.to_numeric(tlead["NumberOfLaps"], errors="coerce").fillna(0).astype(int)
                # The leader-of-the-race's lap times — use any driver and find their position-1 windows
                # Simpler: use the timing_df's Sector3SessionTime + NumberOfLaps grouped, and infer lap from secs
                race_lap_marks = (
                    tlead.dropna(subset=["Sector3SessionTime"])
                    .assign(_s=tlead["Sector3SessionTime"].apply(_td_to_seconds))
                    .groupby("NumberOfLaps")["_s"]
                    .min()
                    .reset_index()
                    .sort_values("NumberOfLaps")
                )
                for _, lr in race_lap_marks.iterrows():
                    leader_total_secs.append((float(lr["_s"]), int(lr["NumberOfLaps"])))
            except Exception:
                pass

        def lap_at(secs: float) -> int:
            # Binary-ish — return the largest lap whose mark <= secs (+1 since they're on the next lap)
            if not leader_total_secs:
                return 0
            chosen = 0
            for s, lap in leader_total_secs:
                if s <= secs:
                    chosen = lap
                else:
                    break
            return chosen + 1

        events: list[dict] = []
        for _, row in moves_up.iterrows():
            t = float(row["secs"])
            new_pos = int(row["Position"])
            overtaker_num = str(row["Driver"])
            # Find who was at new_pos right before this event (most recent row before t)
            candidates = [(s, d) for s, d in pos_by_time.get(new_pos, [])
                          if 0 < t - s < 30 and d != overtaker_num]
            overtaken_num = candidates[-1][1] if candidates else None
            ovr_meta = self.drivers_meta.get(overtaker_num, {})
            ovd_meta = self.drivers_meta.get(overtaken_num or "", {})
            events.append({
                "time":            t,
                "lap":             lap_at(t),
                "overtaker_code":  ovr_meta.get("driver_code") or overtaker_num,
                "overtaker_team":  ovr_meta.get("team_name") or "",
                "overtaken_code":  ovd_meta.get("driver_code") or overtaken_num,
                "overtaken_team":  ovd_meta.get("team_name") or "",
                "new_position":    new_pos,
            })

        # De-duplicate near-simultaneous swaps for the same pair
        seen = set()
        unique: list[dict] = []
        for e in events:
            key = (e["lap"], e["overtaker_code"], e["overtaken_code"], e["new_position"])
            if key in seen:
                continue
            seen.add(key)
            unique.append(e)

        unique.sort(key=lambda x: (x["lap"], x["time"]))
        return unique

    def overtakes(self) -> list[dict]:
        # Cache result on the instance — dataclass instances can't be lru_cache'd
        cached = getattr(self, "_overtakes_cache", None)
        if cached is None:
            cached = self._compute_overtakes()
            object.__setattr__(self, "_overtakes_cache", cached)
        return cached

    # ── Continuous trajectory (session-time-resolution) ──────────────────────

    def trajectory(self) -> dict:
        """Return a single payload describing every driver's continuous
        position across the whole race.

        Why this exists: the per-lap `snapshot()` shape is too sparse for
        smooth playback — dots jump every lap boundary. The race-cache pickle
        already contains ~1.6k position samples per driver (median 3.5 s),
        and the timing pickle gives us per-sector boundary times. Combining
        the two lets us emit a per-driver list of `(t_sec, race_progress)`
        marks that the frontend can rAF-interpolate against.

        Output shape (columnar — small over the wire):

            {
              "season", "round", "race_name", "circuit_id", "n_laps",
              "session_duration_s": float,
              "drivers": [
                {
                  "code", "number", "team_name", "team_colour",
                  "samples": {
                    "t":   [float, ...],   # session seconds
                    "p":   [float, ...],   # race progress (lap + lap_fraction)
                    "pos": [int,   ...],   # position in field at that t
                    "gap": [float|null, ...],
                    "int": [float|null, ...],
                  },
                  "compound_changes": [{"lap": int, "compound": str, "stint": int}],
                  "pit_laps":         [int, ...],
                  "final_lap":        int,
                }, ...
              ],
              "track_status_changes": [{"t": float, "status": str}],
              "overtakes":            [ ... ],   # same shape as /overtakes
            }
        """
        cached = getattr(self, "_trajectory_cache", None)
        if cached is not None:
            return cached
        out = self._compute_trajectory()
        object.__setattr__(self, "_trajectory_cache", out)
        return out

    def _compute_trajectory(self) -> dict:
        empty = {
            "season":              self.season,
            "round":               self.round,
            "race_name":           self.race_name,
            "circuit_id":          self.circuit_id,
            "n_laps":              self.n_laps,
            "session_duration_s":  0.0,
            "drivers":             [],
            "track_status_changes": [],
            "overtakes":           [],
        }
        if self.position_df is None or self.position_df.empty:
            return empty

        # ── 1) Build the MASTER leader-progress curve ────────────────────────
        # The leader at any moment is the one with Position==1 in position_df.
        # As the leader changes (overtakes, pit stops) we follow whoever is on
        # top — their sector-boundary marks become the canonical race-progress
        # timeline. Every other driver's progress is derived by subtracting
        # their `gap_to_leader` (seconds) divided by the reference lap pace.
        #
        # This is the correct broadcast model: TV graphics interleave leaders'
        # actual on-track position with each follower's time-gap behind. The
        # earlier "per-driver sector mark interpolation" produced near-identical
        # progress curves for cars within a second of each other because they
        # all hit sector boundaries within the same ~1s window.

        t = self.timing_df.copy()
        t["NumberOfLaps"] = pd.to_numeric(t["NumberOfLaps"], errors="coerce").fillna(0).astype(int)
        t["_s1"] = t["Sector1SessionTime"].apply(_td_to_seconds)
        t["_s2"] = t["Sector2SessionTime"].apply(_td_to_seconds)
        t["_s3"] = t["Sector3SessionTime"].apply(_td_to_seconds)

        # Average lap pace per driver (median of their lap times) — needed to
        # convert gap-seconds → lap-fractions.
        avg_lap: dict[str, float] = {}
        for drv, sub in t.groupby("Driver", sort=False):
            drv = str(drv)
            laps_d = sub["LapTime"].apply(_td_to_seconds).dropna()
            avg_lap[drv] = float(laps_d.median()) if len(laps_d) > 0 else 90.0

        # Reference pace — median over all drivers' median laps. Used as the
        # divisor when computing race-progress from gap-seconds. Robust to one
        # driver having a slow safety-car-affected median.
        median_pace = float(np.median(list(avg_lap.values()))) if avg_lap else 90.0

        # Build per-driver sector marks — needed to compute the leader's
        # progress curve. (driver_number → list of (t_sec, race_progress))
        sector_marks: dict[str, list[tuple[float, float]]] = {}
        for drv, sub in t.groupby("Driver", sort=False):
            drv = str(drv)
            marks: list[tuple[float, float]] = []
            for _, r in sub.iterrows():
                lap = int(r["NumberOfLaps"])
                if lap <= 0:
                    continue
                for s_secs, frac in (
                    (r["_s1"], 1 / 3.0),
                    (r["_s2"], 2 / 3.0),
                    (r["_s3"], 1.0),
                ):
                    if s_secs is not None and not pd.isna(s_secs):
                        marks.append((float(s_secs), (lap - 1) + frac))
            marks.sort()
            sector_marks[drv] = marks

        # ── 2) For each driver, sample at the times in position_df ───────────
        pos = self.position_df.copy()
        pos["_secs"] = pos["Time"].apply(_td_to_seconds)
        pos["Position"] = pd.to_numeric(pos["Position"], errors="coerce")
        pos = pos.dropna(subset=["_secs", "Position", "Driver"])
        pos["Driver"] = pos["Driver"].astype(str)
        session_dur = float(pos["_secs"].max())

        # Build the MASTER leader curve: for every sample row where Position==1,
        # we know which driver was leading at session-time t. Look up THAT
        # driver's sector marks to compute their progress at t, then take the
        # max across all leader candidates to handle small position-1
        # double-marks during overtakes (a 1-frame swap shouldn't make
        # progress rewind).
        def driver_progress_at(drv: str, t_sec: float) -> float:
            marks = sector_marks.get(drv)
            if not marks:
                # No sector data — fall back to constant pace from origin
                pace = avg_lap.get(drv, median_pace)
                return t_sec / pace if pace > 0 else 0.0
            times = [m[0] for m in marks]
            idx = bisect.bisect_left(times, t_sec)
            if idx == 0:
                t1, p1 = marks[0]
                return (t_sec / t1) * p1 if t1 > 0 else 0.0
            if idx >= len(marks):
                t_last, p_last = marks[-1]
                pace = avg_lap.get(drv, median_pace)
                return p_last + max(0.0, (t_sec - t_last) / pace) if pace > 0 else p_last
            t0, p0 = marks[idx - 1]
            t1, p1 = marks[idx]
            if t1 <= t0:
                return p1
            frac = (t_sec - t0) / (t1 - t0)
            return p0 + (p1 - p0) * frac

        leader_rows = pos[pos["Position"] == 1].sort_values("_secs")
        leader_curve: list[tuple[float, float]] = []
        prev_p = -1.0
        for _, r in leader_rows.iterrows():
            t_sec = float(r["_secs"])
            ldr = str(r["Driver"])
            p = driver_progress_at(ldr, t_sec)
            # Monotonic — never let progress jump backwards
            if p > prev_p:
                leader_curve.append((t_sec, p))
                prev_p = p

        # Anchor the curve at the race-START time, not session_time=0. F1
        # session pickles include 1-2 hours of pre-race position samples
        # (formation laps, red flags, etc.) BEFORE lights-out. During that
        # period, the position_df records who is "at P1" but they're not
        # actually racing — their progress should stay at 0.
        #
        # Strategy: find the leader's FIRST real sector boundary (first entry
        # in leader_curve with progress > 0.1, i.e. past S1 of lap 1). Anchor
        # race_start_t one nominal lap before that, so the lerp from the
        # anchor to the first sector mark spans exactly one lap of progress.
        # Then drop any leader_curve entries before the anchor — those were
        # the pre-race noise we want to hide.
        first_real_idx = next(
            (i for i, (_, p) in enumerate(leader_curve) if p > 0.1),
            None,
        )
        if first_real_idx is not None:
            first_real_t, first_real_p = leader_curve[first_real_idx]
            race_start_t = max(0.0, first_real_t - median_pace * first_real_p)
            # Drop pre-race entries
            leader_curve = [(race_start_t, 0.0)] + leader_curve[first_real_idx:]
        elif leader_curve:
            race_start_t = leader_curve[0][0]
            leader_curve = [(race_start_t, 0.0)] + leader_curve
        else:
            race_start_t = 0.0
            leader_curve = [(0.0, 0.0)]

        race_end_t = leader_curve[-1][0] if leader_curve else session_dur

        def leader_progress_at(t_sec: float) -> float:
            if not leader_curve:
                return 0.0
            times = [m[0] for m in leader_curve]
            idx = bisect.bisect_left(times, t_sec)
            if idx == 0:
                return leader_curve[0][1]
            if idx >= len(leader_curve):
                # Extrapolate from last leader pace
                t_last, p_last = leader_curve[-1]
                return p_last + max(0.0, (t_sec - t_last) / median_pace)
            t0, p0 = leader_curve[idx - 1]
            t1, p1 = leader_curve[idx]
            if t1 <= t0:
                return p1
            frac = (t_sec - t0) / (t1 - t0)
            return p0 + (p1 - p0) * frac

        def progress_at(drv: str, t_sec: float, gap_seconds: Optional[float]) -> float:
            """Race progress for `drv` at `t_sec`, using leader curve + gap offset."""
            leader_p = leader_progress_at(t_sec)
            if gap_seconds is None or gap_seconds <= 0:
                # This driver IS the leader at this moment — use their own
                # sector marks (slightly more accurate than the leader curve
                # because the leader curve may be smoothed across leader
                # changes).
                return driver_progress_at(drv, t_sec)
            # Trailing driver: their progress = leader's progress − gap as a
            # fraction of a lap. Use the median race pace as the divisor since
            # any single-driver median can be skewed by SC laps.
            return max(0.0, leader_p - gap_seconds / max(median_pace, 1e-6))

        # Per-driver pit/stint timeline + lap-time chart data from lap_data.
        # `pit_windows` give the frontend session-time ranges to DIM the dot
        # during the stop; `lap_times` feed the telemetry mini-window.
        compound_changes_by_drv: dict[str, list[dict]] = {}
        pit_laps_by_drv: dict[str, list[int]] = {}
        pit_windows_by_drv: dict[str, list[dict]] = {}
        lap_times_by_drv: dict[str, list[dict]] = {}
        final_lap_by_drv: dict[str, int] = {}
        if self.lap_data_df is not None and not self.lap_data_df.empty:
            ld = self.lap_data_df.sort_values(["driver_code", "lap_number"])
            for code, grp in ld.groupby("driver_code"):
                rows = list(grp.iterrows())
                seen_compound = None
                seen_stint = None
                changes: list[dict] = []
                pits: list[int] = []
                pit_windows: list[dict] = []
                lap_times: list[dict] = []
                last_lap = 0
                for j, (_, r) in enumerate(rows):
                    lap = int(r["lap_number"]) if pd.notna(r.get("lap_number")) else 0
                    last_lap = max(last_lap, lap)
                    comp = r.get("compound")
                    stint = int(r["stint"]) if pd.notna(r.get("stint")) else None
                    if isinstance(comp, str) and comp.lower() in ("nan", "none", "unknown", ""):
                        comp = None
                    if comp and (comp != seen_compound or stint != seen_stint):
                        changes.append({"lap": lap, "compound": comp, "stint": stint})
                        seen_compound, seen_stint = comp, stint

                    # Lap-time chart datum — `lap_time_ms` is the canonical
                    # column in lap_data.parquet (raw milliseconds).
                    lt_secs = _ms_to_seconds(r.get("lap_time_ms"))
                    if lt_secs is not None and lt_secs > 0:
                        lap_times.append({
                            "lap": lap,
                            "t":   round(lt_secs, 3),
                            "compound": comp,
                        })

                    # Pit window — in_t from this lap; out_t from the next lap
                    # if available, else a conservative 28s default fallback.
                    # pit_in/out are stored as raw ms-valued floats.
                    pit_in = _ms_to_seconds(r.get("pit_in_time"))
                    if pit_in is not None:
                        pits.append(lap)
                        out_t = None
                        if j + 1 < len(rows):
                            out_t = _ms_to_seconds(rows[j + 1][1].get("pit_out_time"))
                        if out_t is None or out_t < pit_in:
                            out_t = pit_in + 28.0
                        pit_windows.append({
                            "lap":  lap,
                            "in_t": round(pit_in, 2),
                            "out_t": round(out_t, 2),
                        })
                compound_changes_by_drv[code] = changes
                pit_laps_by_drv[code] = sorted(set(pits))
                pit_windows_by_drv[code] = pit_windows
                lap_times_by_drv[code] = lap_times
                final_lap_by_drv[code] = last_lap

        # Gap / interval — parse from "+1.247" / "LAP 1" / NaN
        def parse_gap(v: Any) -> Optional[float]:
            if v is None or (isinstance(v, float) and pd.isna(v)):
                return None
            s = str(v).strip()
            if not s or s.upper().startswith("LAP"):
                return None
            try:
                return float(s.lstrip("+"))
            except ValueError:
                return None

        drivers_out: list[dict] = []
        for drv, group in pos.groupby("Driver", sort=False):
            drv = str(drv)
            meta = self.drivers_meta.get(drv, {})
            driver_code = meta.get("driver_code") or drv
            grid_pos = meta.get("grid_position") or 20
            sub = group.sort_values("_secs")

            tt_raw = sub["_secs"].astype(float).tolist()
            ps_raw = sub["Position"].astype(int).tolist()
            gaps_raw = [parse_gap(v) for v in sub["GapToLeader"].tolist()]
            ints_raw = [parse_gap(v) for v in sub["IntervalToPositionAhead"].tolist()]

            # Drop pre-race samples (formation lap, sitting on grid). The
            # `position_df` records who is "P1" during this period but it's
            # not racing data — keeping these breaks the frontend's linear
            # interpolation between (t=6, p≈0) and (t=4378, p≈1), which would
            # produce progress=0.97 at race_start_t (= leader appearing
            # almost-finished-with-lap-1 the moment you press Play).
            #
            # Then anchor a synthetic sample at race_start_t with progress=0
            # / on the grid. Guarantees the frontend always has a valid lerp
            # window starting from lights-out.
            tt: list[float] = [race_start_t]
            ps: list[int] = [grid_pos]
            gaps: list[Optional[float]] = [0.0]
            ints: list[Optional[float]] = [None]
            for t_val, p_val, g_val, i_val in zip(tt_raw, ps_raw, gaps_raw, ints_raw):
                if t_val > race_start_t:
                    tt.append(t_val); ps.append(p_val)
                    gaps.append(g_val); ints.append(i_val)

            # Progress = leader_curve(t) − last_known_gap/pace. Carry forward
            # the last non-null gap so frames with no gap data still get a
            # sensible progress that tracks the leader.
            #
            # Hard-code progress=0 for the synthetic race_start_t sample at
            # index 0 — `progress_at` would otherwise interpolate using the
            # driver's first sector mark (which may be sector 2 or 3 if the
            # earlier ones are NaN), producing a bogus 0.66 progress at
            # lights-out for some drivers.
            pp: list[float] = [0.0]
            last_gap = 0.0
            for i in range(1, len(tt)):
                g = gaps[i]
                if g is not None:
                    last_gap = g
                pp.append(round(progress_at(drv, tt[i], last_gap), 5))

            drivers_out.append({
                "code":             driver_code,
                "number":           meta.get("driver_number"),
                "team_name":        meta.get("team_name") or "",
                "team_colour":      None,
                "samples": {
                    "t":   [round(x, 2) for x in tt],
                    "p":   pp,
                    "pos": ps,
                    "gap": gaps,
                    "int": ints,
                },
                "compound_changes": compound_changes_by_drv.get(driver_code, []),
                "pit_laps":         pit_laps_by_drv.get(driver_code, []),
                "pit_windows":      pit_windows_by_drv.get(driver_code, []),
                "lap_times":        lap_times_by_drv.get(driver_code, []),
                "final_lap":        final_lap_by_drv.get(driver_code, 0),
            })

        # ── 3) Track status changes ──────────────────────────────────────────
        status_changes: list[dict] = []
        if self.track_status_df is not None and not self.track_status_df.empty:
            df = self.track_status_df.copy()
            if "Time" in df.columns:
                df["_s"] = df["Time"].apply(_td_to_seconds)
                df = df.dropna(subset=["_s"]).sort_values("_s")
                last_status: Optional[str] = None
                for _, r in df.iterrows():
                    code = r.get("Status")
                    try:
                        code = int(code)
                    except (TypeError, ValueError):
                        continue
                    status = _TRACK_STATUS_MAP.get(code, "AllClear")
                    if status == last_status:
                        continue
                    status_changes.append({"t": round(float(r["_s"]), 2), "status": status})
                    last_status = status

        # ── 4) Leader lap-completion times — lets the frontend map laps to
        #       session-seconds for the scrubber.
        lap_marks: list[float] = []
        try:
            tlead = self.timing_df.copy()
            tlead["NumberOfLaps"] = pd.to_numeric(tlead["NumberOfLaps"], errors="coerce").fillna(0).astype(int)
            race_lap_marks = (
                tlead.dropna(subset=["Sector3SessionTime"])
                .assign(_s=tlead["Sector3SessionTime"].apply(_td_to_seconds))
                .dropna(subset=["_s"])
                .groupby("NumberOfLaps")["_s"]
                .min()
                .reset_index()
                .sort_values("NumberOfLaps")
            )
            for _, r in race_lap_marks.iterrows():
                lap = int(r["NumberOfLaps"])
                if 1 <= lap <= self.n_laps:
                    lap_marks.append(round(float(r["_s"]), 2))
        except Exception:
            pass

        # ── 4b) Sector marks — for a clean mid-race lap, fractional positions
        #         where sector 1 and sector 2 end. Sector lengths are
        #         circuit-specific (not equally 1/3 each) so we derive them
        #         from real timing rather than assuming 0.33 / 0.66.
        sector_marks_out: list[float] = []
        try:
            tlead = self.timing_df.copy()
            tlead["NumberOfLaps"] = pd.to_numeric(tlead["NumberOfLaps"], errors="coerce").fillna(0).astype(int)
            tlead["_s1_t"] = tlead["Sector1Time"].apply(_td_to_seconds)
            tlead["_s2_t"] = tlead["Sector2Time"].apply(_td_to_seconds)
            tlead["_s3_t"] = tlead["Sector3Time"].apply(_td_to_seconds)
            tlead["_lt"]   = tlead["LapTime"].apply(_td_to_seconds)
            # Pick a clean lap: any row where all four times are present and
            # the LapTime is close to the median (filters out pit / SC laps).
            valid = tlead.dropna(subset=["_s1_t", "_s2_t", "_s3_t", "_lt"])
            if not valid.empty:
                med = float(valid["_lt"].median())
                # Tight band around the median = a green-flag racing lap
                clean = valid[(valid["_lt"] > med * 0.95) & (valid["_lt"] < med * 1.05)]
                ref = clean.iloc[0] if not clean.empty else valid.iloc[0]
                lap_len = float(ref["_lt"])
                s1_end = float(ref["_s1_t"]) / lap_len
                s2_end = (float(ref["_s1_t"]) + float(ref["_s2_t"])) / lap_len
                sector_marks_out = [
                    round(max(0.0, min(1.0, s1_end)), 4),
                    round(max(0.0, min(1.0, s2_end)), 4),
                ]
        except Exception as exc:
            log.warning("Sector mark derivation failed for %s R%s: %s",
                        self.season, self.round, exc)

        return {
            "season":              self.season,
            "round":               self.round,
            "race_name":           self.race_name,
            "circuit_id":          self.circuit_id,
            "n_laps":              self.n_laps,
            "session_duration_s":  round(session_dur, 2),
            "race_start_t":        round(race_start_t, 2),
            "race_end_t":          round(race_end_t, 2),
            "drivers":             drivers_out,
            "lap_marks":           lap_marks,
            "track_status_changes": status_changes,
            "overtakes":           self.overtakes(),
            "sector_marks":        sector_marks_out,
        }

    # ── Race-level metadata ──────────────────────────────────────────────────

    def meta(self) -> dict:
        # Final-result podium
        podium = []
        for _, m in sorted(self.drivers_meta.items(),
                           key=lambda kv: kv[1].get("finish_position") or 99):
            if m.get("finish_position") and m["finish_position"] <= 3:
                podium.append({
                    "position":    m["finish_position"],
                    "driver_code": m["driver_code"],
                    "team_name":   m["team_name"],
                })
        return {
            "season":     self.season,
            "round":      self.round,
            "race_name":  self.race_name,
            "circuit_id": self.circuit_id,
            "n_laps":     self.n_laps,
            "n_drivers":  len(self.drivers_meta),
            "podium":     podium,
        }


# ── Loader ────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=16)
def load_race(season: int, round_num: int) -> Optional[Replay]:
    """Open the cached pickle for (season, round) and return a Replay object."""
    index = load_index()
    if index.empty:
        log.warning("Replay index empty — run `python -m src.live.replay_index`")
        return None
    row = index[(index["season"] == season) & (index["round"] == round_num)]
    if row.empty:
        return None
    row = row.iloc[0]

    pkl_path = Path(row["cache_path"])
    if not pkl_path.exists():
        log.warning("Pickle missing: %s", pkl_path)
        return None

    try:
        with open(pkl_path, "rb") as f:
            raw = pickle.load(f)
        timing_df, position_df, _intervals = raw["data"]
    except Exception as exc:
        log.warning("Could not parse %s: %s", pkl_path, exc)
        return None

    drivers_meta = _driver_meta(season, round_num)
    aux = _load_aux_pickles(pkl_path)
    lap_data_df = _lap_data_for_race(season, round_num)

    raw_circuit_id = str(row.get("circuit_id") or "")
    # Normalise FastF1 "Location" values (Sakhir, Monte Carlo, Budapest…)
    # to our circuits.csv slugs so /circuits/{id}.svg resolves.
    normalized_id = _normalize_circuit_id(raw_circuit_id) or raw_circuit_id.lower().replace(" ", "_")

    return Replay(
        season=season,
        round=round_num,
        race_name=str(row["race_name"]),
        circuit_id=normalized_id,
        n_laps=int(row["n_laps"]),
        timing_df=timing_df,
        position_df=position_df,
        drivers_meta=drivers_meta,
        track_status_df=aux.get("track_status", pd.DataFrame()),
        lap_data_df=lap_data_df,
    )

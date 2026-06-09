"""
Build a unified live-session snapshot from the OpenF1 client.

A LiveSnapshot is the single object the dashboard listens for over
the WebSocket. It contains positions, intervals, stints, pit counts,
race-control messages, and the latest weather sample.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from . import openf1_client as f1

log = logging.getLogger(__name__)


def _safe_int(v) -> Optional[int]:
    try:
        if v is None or pd.isna(v):
            return None
        return int(v)
    except Exception:
        return None


def _safe_float(v) -> Optional[float]:
    try:
        if v is None or pd.isna(v):
            return None
        return float(v)
    except Exception:
        return None


def build_snapshot(session_key: Optional[int] = None) -> dict:
    """
    Return a JSON-serializable snapshot for the given session
    (or the latest session if session_key is None).
    """
    session = (
        next(iter(f1.get_sessions(session_key=session_key).to_dict("records")), None)
        if session_key is not None
        else f1.get_current_session()
    )

    if session is None:
        return {
            "session_key": None,
            "status": "no_session",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "drivers": [],
            "race_control": [],
            "weather": {},
        }

    sk = int(session["session_key"])

    drivers   = f1.get_drivers(sk)
    positions = f1.get_positions(sk)
    intervals = f1.get_intervals(sk)
    stints    = f1.get_stints(sk)
    pit       = f1.get_pit(sk)
    rcm       = f1.get_race_control(sk)
    weather   = f1.get_weather(sk)

    # Latest stint per driver
    latest_stint = pd.DataFrame()
    if not stints.empty:
        stints["stint_number"] = pd.to_numeric(stints["stint_number"], errors="coerce")
        latest_stint = (
            stints.sort_values("stint_number")
            .groupby("driver_number", as_index=False)
            .tail(1)
        )

    pit_counts = pd.DataFrame()
    if not pit.empty:
        pit_counts = (
            pit.groupby("driver_number").size().rename("pit_count").reset_index()
        )

    # Merge per-driver fields
    rows = []
    if not drivers.empty:
        merged = drivers[[
            "driver_number", "name_acronym", "team_name", "team_colour",
            "full_name", "first_name", "last_name", "headshot_url"
        ]].copy() if all(c in drivers.columns for c in ["driver_number", "name_acronym"]) else drivers.copy()

        if not positions.empty and "position" in positions.columns:
            merged = merged.merge(
                positions[["driver_number", "position"]],
                on="driver_number", how="left",
            )
        if not intervals.empty:
            cols = [c for c in ["driver_number", "gap_to_leader", "interval"]
                    if c in intervals.columns]
            merged = merged.merge(intervals[cols], on="driver_number", how="left")
        if not latest_stint.empty:
            cols = [c for c in
                    ["driver_number", "compound", "stint_number", "lap_start", "lap_end"]
                    if c in latest_stint.columns]
            merged = merged.merge(latest_stint[cols], on="driver_number", how="left")
        if not pit_counts.empty:
            merged = merged.merge(pit_counts, on="driver_number", how="left")

        merged = merged.sort_values("position") if "position" in merged.columns else merged

        for _, r in merged.iterrows():
            rows.append({
                "driver_number":  _safe_int(r.get("driver_number")),
                "driver_code":    r.get("name_acronym") or "",
                "full_name":      r.get("full_name") or "",
                "team_name":      r.get("team_name") or "",
                "team_colour":    f"#{r['team_colour']}" if r.get("team_colour") else None,
                "headshot_url":   r.get("headshot_url") or None,
                "position":       _safe_int(r.get("position")),
                "gap_to_leader":  r.get("gap_to_leader"),
                "interval":       r.get("interval"),
                "compound":       r.get("compound") or None,
                "stint_number":   _safe_int(r.get("stint_number")),
                "lap_start":      _safe_int(r.get("lap_start")),
                "pit_count":      _safe_int(r.get("pit_count")) or 0,
            })

    # Race control (most recent 20)
    rc_rows = []
    if not rcm.empty:
        cols = [c for c in ["date", "category", "flag", "message", "lap_number"]
                if c in rcm.columns]
        rcm_sub = rcm[cols].sort_values("date", ascending=False).head(20)
        for _, r in rcm_sub.iterrows():
            rc_rows.append({k: (str(v) if k == "date" else v) for k, v in r.to_dict().items()})

    # Weather (latest sample)
    w_row: dict = {}
    if not weather.empty:
        latest = weather.sort_values("date").iloc[-1].to_dict() if "date" in weather.columns else weather.iloc[-1].to_dict()
        w_row = {
            "air_temperature":   _safe_float(latest.get("air_temperature")),
            "track_temperature": _safe_float(latest.get("track_temperature")),
            "humidity":          _safe_float(latest.get("humidity")),
            "wind_speed":        _safe_float(latest.get("wind_speed")),
            "rainfall":          bool(latest.get("rainfall") or 0),
        }

    return {
        "session_key":  sk,
        "session_name": session.get("session_name"),
        "session_type": session.get("session_type"),
        "circuit_short_name": session.get("circuit_short_name"),
        "country_name":  session.get("country_name"),
        "year":          session.get("year"),
        "status":        session.get("session_status") or "unknown",
        "fetched_at":    datetime.now(timezone.utc).isoformat(),
        "drivers":       rows,
        "race_control":  rc_rows,
        "weather":       w_row,
    }

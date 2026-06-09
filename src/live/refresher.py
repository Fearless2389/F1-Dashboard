"""
Background refresher — keeps live snapshot fresh.

Two modes:
  - `start_scheduler(broadcast=...)` — APScheduler BackgroundScheduler
    used by the FastAPI lifespan.
  - `refresh_once()` — fire one update synchronously (for CLI / cron).
"""

import argparse
import json
import logging
from typing import Any, Awaitable, Callable, Optional

from apscheduler.schedulers.background import BackgroundScheduler

from .config import (
    CURRENT_SESSION_FILE,
    LIVE_REFRESH_INTERVAL_S,
    SCHEDULE_REFRESH_INTERVAL_S,
)
from .schedule import get_season_schedule
from .session_snapshot import build_snapshot

log = logging.getLogger(__name__)


def _write_snapshot(snapshot: dict) -> None:
    try:
        CURRENT_SESSION_FILE.write_text(json.dumps(snapshot, default=str))
    except Exception as exc:
        log.warning("Snapshot write failed: %s", exc)


def refresh_once(broadcast: Optional[Callable[[str, dict], Any]] = None) -> dict:
    """Pull a fresh snapshot, persist it, optionally broadcast it."""
    snap = build_snapshot()
    _write_snapshot(snap)
    if broadcast is not None:
        try:
            result = broadcast("live", snap)
            # If broadcast is async, schedule it; we're sync here
            if hasattr(result, "__await__"):
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.ensure_future(result)
                    else:
                        loop.run_until_complete(result)
                except RuntimeError:
                    pass
        except Exception as exc:
            log.warning("Broadcast failed: %s", exc)
    return snap


def refresh_schedule_caches() -> None:
    from datetime import datetime, timezone
    year = datetime.now(timezone.utc).year
    for y in (year, year + 1):
        try:
            get_season_schedule(y)
        except Exception as exc:
            log.warning("Schedule refresh %d failed: %s", y, exc)


def start_scheduler(
    broadcast: Optional[Callable[[str, dict], Any]] = None,
) -> BackgroundScheduler:
    """Start a BackgroundScheduler with live + schedule refresh jobs."""
    sched = BackgroundScheduler(daemon=True)

    sched.add_job(
        refresh_once,
        "interval",
        seconds=LIVE_REFRESH_INTERVAL_S,
        kwargs={"broadcast": broadcast},
        id="live_refresh",
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        refresh_schedule_caches,
        "interval",
        seconds=SCHEDULE_REFRESH_INTERVAL_S,
        id="schedule_refresh",
        max_instances=1,
        coalesce=True,
    )

    sched.start()
    log.info(
        "Refresher started: live=%ds, schedule=%ds",
        LIVE_REFRESH_INTERVAL_S, SCHEDULE_REFRESH_INTERVAL_S,
    )
    return sched


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s %(message)s",
    )
    parser = argparse.ArgumentParser(description="OpenF1 live refresher")
    parser.add_argument("--once", action="store_true", help="One-shot refresh")
    parser.add_argument("--foreground", action="store_true",
                        help="Run as a long-lived process")
    args = parser.parse_args()

    if args.once:
        snap = refresh_once()
        print(json.dumps({
            "session_key": snap.get("session_key"),
            "status": snap.get("status"),
            "drivers": len(snap.get("drivers") or []),
        }, indent=2))
    elif args.foreground:
        import time
        sched = start_scheduler()
        try:
            while True:
                time.sleep(60)
        except KeyboardInterrupt:
            sched.shutdown()
    else:
        parser.print_help()

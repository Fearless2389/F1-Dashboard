"""One-shot: backfill car_data + position_data for played 2026 races.

Loads each race with telemetry=True so FastF1 writes car_data.ff1pkl and
position_data.ff1pkl into data/cache/. Used once to enrich 2026 race folders
for full-telemetry replay on the deployed Space.
"""
import sys
from pathlib import Path

import fastf1

ROOT = Path(__file__).resolve().parents[1]
fastf1.Cache.enable_cache(str(ROOT / "data" / "cache"))
fastf1.set_log_level("WARNING")

# Played 2026 races: R1 (Australia) through R6 (Monaco), as of 2026-06-11.
for r in range(1, 7):
    print(f"=== 2026 R{r} ===", flush=True)
    try:
        s = fastf1.get_session(2026, r, "R")
        s.load(telemetry=True, laps=False, weather=False)
        print(f"  loaded: {s.event['EventName']}", flush=True)
    except Exception as exc:
        print(f"  FAILED: {exc}", flush=True)

print("=== DONE ===", flush=True)

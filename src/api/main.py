"""
F1 ML FastAPI application.

Run locally:
    uvicorn src.api.main:app --reload --port 8000
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..live.refresher import start_scheduler
from .routers import apex, historical, live, meta, model, predict, recent, replay, schedule
from .websocket import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("f1ml.api")

# Mutable shared state (read by /api/health)
scheduler_state: dict = {"running": False}


def _warmup_caches() -> None:
    """Pre-load parquets + every trained model so the first request doesn't pay
    the cold-start cost. Runs in a thread so it doesn't block startup.
    """
    try:
        from .deps import get_aligned_dataset, get_feature_matrix, get_manifest, load_model
        log.info("Warm-up: loading parquets…")
        get_feature_matrix()
        get_aligned_dataset()
        get_manifest()
        log.info("Warm-up: loading 6 model artifacts…")
        for name in (
            "xgb_top10.pkl", "xgb_podium.pkl", "lgbm_winner.pkl",
            "xgb_dnf.pkl", "lgbm_fastest_lap.pkl", "lgbm_quali.pkl",
        ):
            load_model(name)
        log.info("Warm-up: complete")
    except Exception as exc:
        log.warning("Warm-up failed (continuing — first request will be cold): %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    manager.bind_loop(loop)

    # Kick the warm-up onto a thread so it doesn't block startup; the loop
    # can start accepting requests immediately while parquets stream in.
    try:
        import threading
        threading.Thread(target=_warmup_caches, daemon=True).start()
    except Exception as exc:
        log.warning("Could not start warm-up thread: %s", exc)

    if os.environ.get("F1ML_DISABLE_REFRESHER", "").lower() not in ("1", "true", "yes"):
        try:
            scheduler = start_scheduler(broadcast=manager.broadcast)
            scheduler_state["running"] = True
            scheduler_state["scheduler"] = scheduler
        except Exception as exc:
            log.warning("Refresher start failed (continuing without live data): %s", exc)
    else:
        log.info("Refresher disabled via F1ML_DISABLE_REFRESHER")

    try:
        yield
    finally:
        sched = scheduler_state.get("scheduler")
        if sched is not None:
            try:
                sched.shutdown(wait=False)
            except Exception:
                pass
        scheduler_state["running"] = False


app = FastAPI(
    title="F1 ML API",
    version="1.0.0",
    description="Predictions, live race data, and historical analytics for Formula 1.",
    lifespan=lifespan,
)

# CORS — allow local dev + the configured frontend origin
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
frontend = os.environ.get("FRONTEND_ORIGIN")
if frontend:
    allowed_origins.append(frontend)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(live.router)
app.include_router(schedule.router)
app.include_router(historical.router)
app.include_router(predict.router)
app.include_router(model.router)
app.include_router(replay.router)
app.include_router(apex.router)
app.include_router(recent.router)


@app.get("/")
def root():
    return {
        "service": "F1 ML API",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }

"""Live race endpoints — HTTP snapshot + WebSocket stream + telemetry."""

import json
import logging

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from ...live import openf1_client as f1
from ...live.config import CURRENT_SESSION_FILE
from ...live.session_snapshot import build_snapshot
from ..schemas import LiveSnapshot
from ..websocket import manager

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/live", tags=["live"])


@router.get("/snapshot", response_model=LiveSnapshot)
def get_snapshot() -> LiveSnapshot:
    """Last-known live snapshot (from refresher cache, or built on demand)."""
    if CURRENT_SESSION_FILE.exists():
        try:
            data = json.loads(CURRENT_SESSION_FILE.read_text())
            return LiveSnapshot(**data)
        except Exception as exc:
            log.warning("Cached snapshot unreadable, rebuilding: %s", exc)
    return LiveSnapshot(**build_snapshot())


@router.get("/telemetry")
def get_telemetry(
    driver_number: int = Query(..., ge=1, le=99),
    session_key: int = Query(..., description="OpenF1 session_key"),
    limit: int = Query(2000, ge=10, le=20000),
):
    """Raw telemetry frames for a single driver in a session."""
    df = f1.get_car_data(session_key, driver_number)
    if df.empty:
        return {"frames": []}
    df = df.tail(limit)
    cols = [c for c in ["date", "speed", "throttle", "brake",
                        "n_gear", "rpm", "drs"] if c in df.columns]
    out = df[cols].copy()
    if "date" in out.columns:
        out["date"] = out["date"].astype(str)
    return {"frames": out.to_dict("records")}


@router.websocket("/stream")
async def stream(ws: WebSocket) -> None:
    """Push the live snapshot to subscribers as the refresher updates it."""
    await manager.connect("live", ws)

    # Send the cached snapshot immediately so the client doesn't wait 5s
    if CURRENT_SESSION_FILE.exists():
        try:
            await ws.send_text(CURRENT_SESSION_FILE.read_text())
        except Exception:
            pass

    try:
        while True:
            # Keep the connection alive; client may ping
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        await manager.disconnect("live", ws)
    except Exception as exc:
        log.warning("WS error: %s", exc)
        await manager.disconnect("live", ws)

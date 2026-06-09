"""WebSocket connection manager with channels (live, predictions)."""

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.channels: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, channel: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.channels.setdefault(channel, set()).add(ws)
        log.info("WS connected: channel=%s total=%d", channel, len(self.channels[channel]))

    async def disconnect(self, channel: str, ws: WebSocket) -> None:
        async with self._lock:
            self.channels.get(channel, set()).discard(ws)

    async def broadcast_async(self, channel: str, payload: Any) -> None:
        async with self._lock:
            targets = list(self.channels.get(channel, set()))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(payload)
            except Exception as exc:
                log.warning("WS send failed, dropping: %s", exc)
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self.channels.get(channel, set()).discard(ws)

    def broadcast(self, channel: str, payload: Any) -> None:
        """Thread-safe broadcast — callable from APScheduler worker thread."""
        if self._loop is None or not self._loop.is_running():
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.broadcast_async(channel, payload), self._loop
            )
        except RuntimeError:
            pass


manager = ConnectionManager()

import { useEffect, useRef, useState } from "react";

import { wsUrl } from "@/lib/api";
import type { LiveSnapshot } from "@/lib/types";

type Status = "connecting" | "open" | "closed" | "error";

interface UseLiveSocket {
  snapshot: LiveSnapshot | null;
  status: Status;
  lastMessageAt: number | null;
}

/**
 * Subscribes to /api/live/stream and keeps the latest snapshot in state.
 * Reconnects with exponential backoff.
 */
export function useLiveSocket(): UseLiveSocket {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    function connect() {
      if (stoppedRef.current) return;
      setStatus("connecting");
      const ws = new WebSocket(wsUrl("/api/live/stream"));
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("open");
        retryRef.current = 0;
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as LiveSnapshot | { type: string };
          if ("type" in data && data.type === "pong") return;
          setSnapshot(data as LiveSnapshot);
          setLastMessageAt(Date.now());
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        if (stoppedRef.current) return;
        const wait = Math.min(30_000, 1_000 * 2 ** retryRef.current);
        retryRef.current += 1;
        setTimeout(connect, wait);
      };
    }

    connect();
    const pingId = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25_000);

    return () => {
      stoppedRef.current = true;
      clearInterval(pingId);
      wsRef.current?.close();
    };
  }, []);

  return { snapshot, status, lastMessageAt };
}

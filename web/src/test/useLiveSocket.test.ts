import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLiveSocket } from "@/hooks/useLiveSocket";

// Pull the helper exposed by setup.ts
function lastWs(): any {
  // @ts-expect-error – test-only
  const all = globalThis.__FakeWebSocket.instances;
  return all[all.length - 1];
}

describe("useLiveSocket", () => {
  it("transitions to open and surfaces the latest snapshot", async () => {
    const { result } = renderHook(() => useLiveSocket());

    await waitFor(() => expect(result.current.status).toBe("open"));

    act(() => {
      lastWs().emit({
        session_key: 7777,
        session_name: "Race",
        status: "Started",
        fetched_at: "2026-06-07T13:00:00Z",
        drivers: [
          {
            driver_number: 1, driver_code: "VER", full_name: "Max Verstappen",
            team_name: "Red Bull", team_colour: "#3671C6", headshot_url: null,
            position: 1, gap_to_leader: null, interval: null, compound: "SOFT",
            stint_number: 1, lap_start: 1, pit_count: 0,
          },
        ],
        race_control: [],
        weather: {
          air_temperature: 28, track_temperature: 40,
          humidity: 50, wind_speed: 3, rainfall: false,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.snapshot?.session_key).toBe(7777);
      expect(result.current.snapshot?.drivers).toHaveLength(1);
      expect(result.current.snapshot?.drivers?.[0]?.driver_code).toBe("VER");
    });
  });

  it("ignores pong frames in the snapshot state", async () => {
    const { result } = renderHook(() => useLiveSocket());
    await waitFor(() => expect(result.current.status).toBe("open"));

    const before = result.current.snapshot;
    act(() => { lastWs().emit({ type: "pong" }); });
    // The snapshot should NOT change to a pong object
    await waitFor(() => expect(result.current.snapshot).toBe(before));
  });
});

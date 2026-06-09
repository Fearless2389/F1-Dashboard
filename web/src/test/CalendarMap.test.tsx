import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarMap } from "@/components/panels/CalendarMap";
import type { RaceEvent } from "@/lib/types";

function makeEvent(round: number, lat: number, lon: number, dateOffsetDays: number): RaceEvent {
  return {
    season: 2026,
    round,
    race_name: `Round ${round} Grand Prix`,
    country: "TestLand",
    location: "TestVille",
    circuit_id: `r${round}`,
    event_date: new Date(Date.now() + dateOffsetDays * 86_400_000).toISOString(),
    session5_date: null,
    circuit_meta: {
      circuit_id: `r${round}`,
      name: `Circuit ${round}`,
      lat, lon,
      country: "TestLand",
      lap_length_km: 5.0,
      num_corners: 15,
      drs_zones: 3,
      downforce_level: "medium",
      overtake_difficulty: 3,
      typical_air_temp_c: 25,
      wet_race_rate: 0.1,
    } as any,
    weather_forecast: null,
  };
}

describe("CalendarMap", () => {
  const events: RaceEvent[] = [
    makeEvent(1, 51.0, -1.0, -30),   // past (UK)
    makeEvent(2, -23.7, -46.7, +14), // future (Brazil)
    makeEvent(3, 26.0, 50.5, +60),   // future (Bahrain)
  ];

  it("renders the legend with past/future counts", () => {
    render(<CalendarMap events={events} />);
    expect(screen.getByText("World Map")).toBeInTheDocument();
    expect(screen.getByText("3 circuits · click any dot for details")).toBeInTheDocument();
    expect(screen.getByText(/Past \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Future \(1\)/)).toBeInTheDocument();
  });

  it("renders a round-number label for each non-future event", () => {
    render(<CalendarMap events={events} />);
    // Past event R1 + next-up R2 both get labels; R3 (further future) doesn't
    expect(screen.getByText("R1")).toBeInTheDocument();
    expect(screen.getByText("R2")).toBeInTheDocument();
  });

  it("handles empty events array without crashing", () => {
    render(<CalendarMap events={[]} />);
    expect(screen.getByText("0 circuits · click any dot for details")).toBeInTheDocument();
  });
});

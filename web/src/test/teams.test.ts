import { describe, expect, it } from "vitest";

import { teamColor, teamColorFallback } from "@/lib/teams";

describe("teamColor", () => {
  it("matches known teams case-insensitively", () => {
    expect(teamColor("Red Bull Racing")).toBe("#3671C6");
    expect(teamColor("red bull racing")).toBe("#3671C6");
    expect(teamColor("McLaren Mercedes")).toBe("#FF8000");
    expect(teamColor("Scuderia Ferrari")).toBe("#E8002D");
  });

  it("falls back to grey for unknown teams", () => {
    expect(teamColor("Some Garage F1")).toBe("#38383f");
    expect(teamColor(null)).toBe("#38383f");
    expect(teamColor(undefined)).toBe("#38383f");
  });

  it("teamColorFallback prefers explicit hex over name lookup", () => {
    expect(teamColorFallback("#abcdef", "Ferrari")).toBe("#abcdef");
    expect(teamColorFallback(null, "Ferrari")).toBe("#E8002D");
    expect(teamColorFallback(undefined, "Unknown")).toBe("#38383f");
  });

  it("recognises Racing Bulls vs Red Bull Racing", () => {
    expect(teamColor("Racing Bulls")).toBe("#6692FF");
    expect(teamColor("Red Bull Racing")).toBe("#3671C6");
  });
});

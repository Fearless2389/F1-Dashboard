import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import Shell from "@/components/Shell";

vi.mock("@/hooks/useApi", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useApi")>("@/hooks/useApi");
  return {
    ...actual,
    useLiveSnapshot: () => ({ data: null, isLoading: false }),
  };
});

function Wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Shell", () => {
  it("renders the Paddock brand wordmark + top + rail navigation", () => {
    render(<Wrap><Shell><div>child</div></Shell></Wrap>);
    expect(screen.getByText("PADDOCK DASHBOARD")).toBeInTheDocument();
    // Top nav
    expect(screen.getByText("Live Race")).toBeInTheDocument();
    expect(screen.getByText("Standings")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Drivers")).toBeInTheDocument();
    // Left rail header
    expect(screen.getByText("RACE CONTROL")).toBeInTheDocument();
    expect(screen.getByText("Sector 1: GREEN")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("falls back to OFFLINE pill when no live session", () => {
    render(<Wrap><Shell><div>child</div></Shell></Wrap>);
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import Shell from "@/components/Shell";

function Wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Shell", () => {
  it("renders the brand wordmark + top nav, with no sidebar or search chrome", () => {
    render(<Wrap><Shell><div>child</div></Shell></Wrap>);

    expect(screen.getByText("PADDOCK DASHBOARD")).toBeInTheDocument();

    // Top nav — all six entries, including the promoted Models link.
    expect(screen.getByText("Live Race")).toBeInTheDocument();
    expect(screen.getByText("Apex")).toBeInTheDocument();
    expect(screen.getByText("Standings")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Drivers")).toBeInTheDocument();
    expect(screen.getByText("Models")).toBeInTheDocument();

    // Sidebar gone.
    expect(screen.queryByText("RACE CONTROL")).toBeNull();
    expect(screen.queryByText("Sector 1: GREEN")).toBeNull();

    // Search + idle action buttons gone.
    expect(screen.queryByPlaceholderText(/search data/i)).toBeNull();
    expect(screen.queryByLabelText(/notifications/i)).toBeNull();
    expect(screen.queryByLabelText(/account/i)).toBeNull();
    expect(screen.queryByText(/^(LIVE|OFFLINE)$/)).toBeNull();

    expect(screen.getByText("child")).toBeInTheDocument();
  });
});

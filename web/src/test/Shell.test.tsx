import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import Shell from "@/components/Shell";

function Wrap({ children, initialEntries = ["/live"] }: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Shell", () => {
  it("renders the brand wordmark + top nav on a dashboard route", () => {
    // Mount on a non-landing route so the top-nav is visible (nav is hidden
    // on the landing page so the hero owns the screen).
    render(<Wrap initialEntries={["/live"]}><Shell><div>child</div></Shell></Wrap>);

    expect(screen.getByText("PADDOCK DASHBOARD")).toBeInTheDocument();

    // Top nav — 5 entries per the Q1.b user-approved plan.
    expect(screen.getByText("Watch")).toBeInTheDocument();
    expect(screen.getByText("Predict")).toBeInTheDocument();
    expect(screen.getByText("Standings")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();

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

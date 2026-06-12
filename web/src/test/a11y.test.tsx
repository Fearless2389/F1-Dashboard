import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import axe from "axe-core";

import LandingRoute from "@/routes/LandingRoute";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Accessibility unit tests. These exercise the routes/components that
 * are fully self-contained (no live API call) — landing page, the
 * SectionHeader primitive, EmptyState, Skeleton.
 *
 * For data-bound surfaces (Apex / Standings / Replay) the right tool
 * is Lighthouse CI against the deployed Space — we run that in the
 * .github/workflows/lighthouse.yml job. axe-core unit tests focus
 * on what the component is responsible for; Lighthouse covers
 * integration scoring against the real DOM tree.
 *
 * The strict ruleset uses WCAG 2.1 AA. We allow `color-contrast` to
 * flag because the test environment's jsdom doesn't compute getComputedStyle
 * the same way headless Chrome does — Lighthouse catches real
 * contrast failures, axe in jsdom would just false-positive.
 */
const AXE_CONFIG: axe.RunOptions = {
  rules: {
    "color-contrast": { enabled: false },
  },
};

function Wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

async function assertNoA11yViolations(node: Element) {
  const results = await axe.run(node, AXE_CONFIG);
  // Useful diagnostic when the test fails — list the violations so the
  // failure message points at the offending rule + node.
  if (results.violations.length > 0) {
    const summary = results.violations
      .map(v => `  · [${v.id}] ${v.help}\n    ${v.nodes.map(n => n.html).join("\n    ")}`)
      .join("\n");
    throw new Error(`axe-core found a11y violations:\n${summary}`);
  }
  expect(results.violations).toEqual([]);
}

describe("a11y", () => {
  it("LandingRoute has no serious WCAG 2.1 AA violations", async () => {
    const { container } = render(<Wrap><LandingRoute /></Wrap>);
    await assertNoA11yViolations(container);
  });

  it("SectionHeader exposes its title as a heading + has an issue index", async () => {
    const { container } = render(
      <Wrap>
        <SectionHeader
          kicker="Section"
          title="Hello world"
          index="RD.18"
          description="Some subtitle text"
        />
      </Wrap>,
    );
    await assertNoA11yViolations(container);
    // Heading is a real <h2>, not a div pretending — semantic check.
    expect(container.querySelector("h2")).toBeTruthy();
  });

  it("EmptyState carries a title + description without ARIA violations", async () => {
    const { container } = render(
      <EmptyState
        title="Nothing here yet"
        description="Come back after the race finishes."
      />,
    );
    await assertNoA11yViolations(container);
  });

  it("Skeleton declares aria-busy for assistive tech", () => {
    const { container } = render(<Skeleton variant="card" aria-busy="true" />);
    // Skeleton doesn't bake in aria-busy by default — callers wrap it
    // in a region that does, which the App.tsx Suspense fallback does.
    // This test asserts the prop-pass-through works.
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
  });
});

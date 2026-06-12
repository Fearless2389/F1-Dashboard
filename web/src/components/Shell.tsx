import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/cn";
import { prefetchForRoute } from "@/lib/prefetch";

interface Props { children: ReactNode; }

/**
 * Top-nav structure — 5 tabs per the user-approved plan (Q1.b):
 *   Watch (was Live Race — now hosts the replay picker)
 *   Predict (was Apex — covers the merged predictor + forecast)
 *   Standings (also covers Drivers via the per-driver page link)
 *   Schedule
 *   About (covers Models too — folded under the explainer surface)
 *
 * Drivers + Models are still reachable via direct URLs (/driver/:code,
 * /model) and are cross-linked from the surfaces above, but they
 * don't earn top-level nav real estate.
 */
const TOP_NAV = [
  { to: "/live",      label: "Watch"     },
  { to: "/apex",      label: "Predict"   },
  { to: "/standings", label: "Standings" },
  { to: "/calendar",  label: "Schedule"  },
  { to: "/about",     label: "About"     },
];

function Topbar() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const onLanding = pathname === "/";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-stretch border-b border-paddock-cream/20 bg-f1-dark/95 backdrop-blur">
      {/* Brand — links home (the landing page now, not /live). */}
      <NavLink
        to="/"
        className="paddock-brand text-xl md:text-2xl select-none flex items-center px-6 border-r border-paddock-cream/15"
      >
        PADDOCK DASHBOARD
      </NavLink>

      {/* Top nav — pit-wall column-gutter treatment: each tab is a fixed
          cell with a vertical hairline divider on its right edge.
          Active state = 2px coral top-rule + cream text. No border-radius
          anywhere. Hidden on the landing page so the hero owns the screen. */}
      {!onLanding && (
        <nav className="ml-auto hidden md:flex items-stretch">
          {TOP_NAV.map(({ to, label }, idx) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/live"}
              onMouseEnter={() => prefetchForRoute(qc, to)}
              onFocus={() => prefetchForRoute(qc, to)}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center justify-center px-5 text-[11px] uppercase tracking-[0.18em] font-semibold transition-colors",
                  idx === 0 && "border-l border-paddock-cream/15",
                  "border-r border-paddock-cream/15",
                  isActive
                    ? "text-paddock-cream bg-white/[0.02]"
                    : "text-f1-muted hover:text-paddock-cream hover:bg-white/[0.015]",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Hard-edged 2px coral top rule announces the active */}
                  {/* tab without any rounded "pill" affordance. */}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 top-0 h-[2px] bg-paddock-coral"
                    />
                  )}
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

export default function Shell({ children }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="flex-1 overflow-x-hidden p-6 f1-grid-bg">
        {children}
      </main>
    </div>
  );
}

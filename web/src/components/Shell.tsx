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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-6 border-b border-f1-edge bg-f1-dark/95 backdrop-blur px-6">
      {/* Brand — links home (the landing page now, not /live). */}
      <NavLink to="/" className="paddock-brand text-xl md:text-2xl select-none">
        PADDOCK DASHBOARD
      </NavLink>

      {/* Top nav — hidden on the landing page so the hero owns the screen.
          Visible everywhere else with hover-prefetch on every link. */}
      {!onLanding && (
        <nav className="ml-auto hidden md:flex items-center gap-2">
          {TOP_NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/live"}
              onMouseEnter={() => prefetchForRoute(qc, to)}
              onFocus={() => prefetchForRoute(qc, to)}
              className={({ isActive }) =>
                cn(
                  "px-3 py-1.5 text-xs uppercase tracking-widest rounded-md transition-colors",
                  "font-medium",
                  isActive
                    ? "text-paddock-coral border-b-2 border-paddock-coral"
                    : "text-f1-muted hover:text-f1-white border-b-2 border-transparent",
                )
              }
            >
              {label}
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

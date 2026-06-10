import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/cn";
import { prefetchForRoute } from "@/lib/prefetch";

interface Props { children: ReactNode; }

// Main routes — the only navigation surface on the dashboard. Single horizontal
// strip in the topbar; no sidebar, no auxiliary chrome.
const TOP_NAV = [
  { to: "/live",      label: "Live Race" },
  { to: "/apex",      label: "Predictor" },
  { to: "/standings", label: "Standings" },
  { to: "/calendar",  label: "Schedule"  },
  { to: "/driver",    label: "Drivers"   },
  { to: "/model",     label: "Models"    },
];


function Topbar() {
  const qc = useQueryClient();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-6 border-b border-f1-edge bg-f1-dark/95 backdrop-blur px-6">
      {/* Brand — italic Playfair, coral */}
      <NavLink to="/live" className="paddock-brand text-xl md:text-2xl select-none">
        PADDOCK DASHBOARD
      </NavLink>

      {/* Horizontal nav — dashed underline / pill on active.
          Hover prefetches the route's queries so clicks feel instant. */}
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

import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Calendar,
  GitCompare,
  LineChart,
  Medal,
  Search,
  Settings,
  Trophy,
  User,
  UserCircle2,
  HelpCircle,
  ChevronsLeft,
} from "lucide-react";

import { useLiveSnapshot } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { prefetchForRoute } from "@/lib/prefetch";

interface Props { children: ReactNode; }

// Main routes — surfaced as horizontal nav in the topbar (Paddock Dashboard style).
const TOP_NAV = [
  { to: "/live",      label: "Live Race" },
  { to: "/apex",      label: "Apex"      },
  { to: "/standings", label: "Standings" },
  { to: "/calendar",  label: "Schedule"  },
  { to: "/driver",    label: "Drivers"   },
];

// Race-context tools — surfaced as a chunky left rail under "RACE CONTROL".
const RAIL_TOOLS = [
  { to: "/live",     label: "Timing",    icon: Activity },
  { to: "/predict",  label: "Telemetry", icon: LineChart },
  { to: "/explore",  label: "Pit Wall",  icon: GitCompare },
  { to: "/model",    label: "Replay",    icon: Medal },
];


function Topbar() {
  const { data: snap } = useLiveSnapshot();
  const qc = useQueryClient();
  const live = snap && (snap.status === "Started" || snap.status === "Active");
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-6 border-b border-f1-edge bg-f1-dark/95 backdrop-blur px-6">
      {/* Brand — italic Playfair, coral */}
      <NavLink to="/live" className="paddock-brand text-xl md:text-2xl select-none">
        PADDOCK DASHBOARD
      </NavLink>

      {/* Horizontal nav — dashed underline / pill on active.
          Hover prefetches the route's queries so clicks feel instant. */}
      <nav className="hidden md:flex items-center gap-2 ml-2">
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

      {/* Search bar */}
      <div className="hidden lg:flex flex-1 max-w-md mx-2 items-center gap-2 h-9 px-3 rounded-full border border-f1-edge bg-f1-panel/60 text-f1-muted">
        <Search size={14} />
        <input
          placeholder="Search Data…"
          className="bg-transparent border-0 outline-none text-xs flex-1 placeholder:text-f1-muted text-f1-white"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {live ? (
          <span className="paddock-pill paddock-glow">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-paddock-coral f1-pulse" />
            LIVE
          </span>
        ) : (
          <span className="paddock-pill" style={{ opacity: 0.45 }}>OFFLINE</span>
        )}
        <button className="h-9 w-9 grid place-items-center rounded-full border border-f1-edge text-f1-muted hover:text-f1-white" aria-label="Notifications">
          <Bell size={14} />
        </button>
        <button className="h-9 w-9 grid place-items-center rounded-full border border-f1-edge text-f1-muted hover:text-f1-white" aria-label="Account">
          <User size={14} />
        </button>
      </div>
    </header>
  );
}


function LeftRail() {
  return (
    <nav className="w-56 shrink-0 border-r border-f1-edge bg-f1-dark/60 py-4 flex flex-col">
      {/* Race Control header card */}
      <div className="px-4 mb-4">
        <div className="paddock-dashed-coral rounded-lg px-3 py-3 bg-f1-panel/40">
          <div className="font-display font-bold text-sm tracking-wide text-paddock-coral">
            RACE CONTROL
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-paddock-cyan f1-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-paddock-cyan font-mono">
              Sector 1: GREEN
            </span>
          </div>
        </div>
      </div>

      {/* Chunky tool nav */}
      <ul className="space-y-2 px-3 flex-1">
        {RAIL_TOOLS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/live"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-xs uppercase tracking-widest",
                  "transition-colors font-semibold",
                  isActive
                    ? "paddock-dashed bg-paddock-cyan/8 text-paddock-cyan"
                    : "text-f1-muted hover:bg-white/5 hover:text-f1-white border-1.5 border-transparent",
                )
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Bottom utility links */}
      <div className="px-3 mt-4 space-y-1.5">
        <button className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-xs uppercase tracking-widest text-f1-muted hover:text-f1-white">
          <Settings size={14} /> Settings
        </button>
        <button className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-xs uppercase tracking-widest text-f1-muted hover:text-f1-white">
          <HelpCircle size={14} /> Support
        </button>
        <button className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-[10px] uppercase tracking-widest text-f1-muted hover:text-f1-white border-t border-f1-edge mt-2 pt-3">
          <ChevronsLeft size={14} /> Collapse
        </button>
      </div>
    </nav>
  );
}


export default function Shell({ children }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <div className="flex flex-1">
        <LeftRail />
        <main className="flex-1 overflow-x-hidden p-6 f1-grid-bg">
          {children}
        </main>
      </div>
    </div>
  );
}

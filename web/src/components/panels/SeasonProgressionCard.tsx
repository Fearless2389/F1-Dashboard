import { m } from "framer-motion";

import { Countdown } from "@/components/Countdown";
import { teamColor } from "@/lib/teams";

interface Props {
  racesCompleted: number;
  totalRaces: number;
  /** ISO timestamp of the next race */
  nextRaceDate?: string | null;
  /** Driver championship leader (real data) */
  leaderCode?: string | null;
  leaderPoints?: number | null;
  /** Driver leader's team — used to colour their code by team livery */
  leaderTeam?: string | null;
  /** Constructor leader */
  constructorLeader?: string | null;
  constructorLeaderPoints?: number | null;
}

/**
 * Season-progression panel on the Standings hero strip. Replaces the old
 * fake "Fastest Lap / Track Temp" values with real, season-meaningful stats:
 *   - races completed / total + cyan progress bar
 *   - countdown to the next race
 *   - drivers' & constructors' championship leaders
 */
export function SeasonProgressionCard({
  racesCompleted, totalRaces, nextRaceDate,
  leaderCode, leaderPoints, leaderTeam,
  constructorLeader, constructorLeaderPoints,
}: Props) {
  const pct = totalRaces > 0 ? (racesCompleted / totalRaces) * 100 : 0;
  const driverColor = teamColor(leaderTeam);
  const constructorColor = teamColor(constructorLeader);

  return (
    <div className="paddock-dashed rounded-xl p-5 bg-f1-panel/50 backdrop-blur w-full md:w-72 flex flex-col gap-4">
      <div className="text-[10px] uppercase tracking-widest text-paddock-cream font-semibold">
        Season Progression
      </div>

      {/* Races + progress bar */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-f1-muted">
            Races Completed
          </div>
          <div className="flex items-baseline gap-1 tabular-nums">
            <span className="font-display font-bold text-2xl text-f1-white">
              {String(racesCompleted).padStart(2, "0")}
            </span>
            <span className="text-f1-muted">/ {totalRaces}</span>
          </div>
        </div>
        <div className="h-1 rounded-full bg-f1-edge overflow-hidden">
          <m.div
            className="h-full"
            style={{ background: "var(--color-paddock-coral)" }}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </div>
      </div>

      {/* Next race countdown */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-f1-muted">Lights out in</div>
        <div className="font-display font-bold text-paddock-coral text-lg mt-1 tabular-nums">
          {nextRaceDate ? <Countdown target={nextRaceDate} compact /> : "—"}
        </div>
      </div>

      {/* Championship leaders — drivers + constructors, each tinted with
          their team's livery colour so the panel reads at a glance. */}
      <div className="grid grid-cols-2 gap-3 border-t border-f1-edge pt-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-f1-muted">Drivers leader</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="h-3 w-1 rounded-sm shrink-0" style={{ background: driverColor }} />
            <div className="font-display font-bold text-base truncate" style={{ color: driverColor }}>
              {leaderCode ?? "—"}
            </div>
          </div>
          <div className="text-[10px] text-f1-muted tabular-nums mt-0.5">
            {leaderPoints != null ? `${Math.round(leaderPoints)} pts` : ""}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-f1-muted">Constructors leader</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="h-3 w-1 rounded-sm shrink-0" style={{ background: constructorColor }} />
            <div className="font-display font-bold text-base truncate" style={{ color: constructorColor }}>
              {constructorLeader ?? "—"}
            </div>
          </div>
          <div className="text-[10px] text-f1-muted tabular-nums mt-0.5">
            {constructorLeaderPoints != null ? `${Math.round(constructorLeaderPoints)} pts` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

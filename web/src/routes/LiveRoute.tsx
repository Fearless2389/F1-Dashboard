import { useMemo } from "react";
import { Calendar as CalIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/Card";
import { ReplayPicker } from "@/components/panels/ReplayPicker";
import { Countdown } from "@/components/Countdown";
import { useSchedule } from "@/hooks/useApi";
import { useRaceContext } from "@/store/raceContext";

/**
 * Replay-focused home — was previously a full live-session dashboard
 * (timing tower + track map + telemetry + race control), but OpenF1
 * returns the most-recently-completed session when nothing is actively
 * live, which made the page misleadingly show "Monaco GP · LIVE" four
 * days after Monaco actually finished. Stripped to two sections:
 *
 *   1. Next-race countdown — pulled straight from the season schedule.
 *   2. ReplayPicker — 2025 + 2026 grid so a viewer can jump straight
 *      into the meat of the project (the replay UI with telemetry).
 *
 * The /api/live/* endpoints + WebSocket infrastructure stay on the
 * backend (no code removed) so they're available if we ever wire a
 * proper live mode again; the UI just doesn't open the socket here.
 */
export default function LiveRoute() {
  const { season } = useRaceContext();
  const { data: schedule } = useSchedule(season, false);

  // Pick the next race that hasn't started yet (give or take 6 hours of
  // race-day slack), or fall back to the first event in the season.
  const nextRace = useMemo(() => {
    const evs = schedule?.events ?? [];
    if (evs.length === 0) return null;
    const now = Date.now();
    return evs.find(ev => {
      const t = ev.session5_date ?? ev.event_date;
      return t ? new Date(t).getTime() > now - 6 * 3600_000 : false;
    }) ?? evs[0];
  }, [schedule]);

  return (
    <div className="space-y-4">
      {/* Next-race countdown — sticky header so a portfolio reviewer
          immediately sees what's coming up next. */}
      {nextRace && (
        <Card>
          <CardContent className="py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="rounded-md bg-f1-red/15 text-f1-red p-2.5">
                <CalIcon size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-f1-muted">Next race</div>
                <div className="font-display text-xl font-semibold truncate tracking-tight">{nextRace.race_name}</div>
                <div className="text-xs text-f1-muted truncate">
                  Round {nextRace.round} · {nextRace.location}, {nextRace.country}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-f1-muted">Lights out in</div>
                <div className="text-2xl text-f1-white tracking-tight tabular-nums">
                  <Countdown target={nextRace.session5_date ?? nextRace.event_date} />
                </div>
              </div>
              {nextRace.event_date && (
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] uppercase tracking-widest text-f1-muted">Race date (UTC)</div>
                  <div className="text-sm tabular-nums">{new Date(nextRace.event_date).toUTCString().slice(0, 16)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Replay picker — the primary surface. Lists every replayable race
          (2025 + 2026 in the deployed cache), with 2026 highlighted by
          default and a 2025 toggle for last season's races. */}
      <ReplayPicker />
    </div>
  );
}

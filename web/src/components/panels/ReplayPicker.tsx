import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

interface ReplayEntry {
  season: number;
  round: number;
  race_name: string;
  circuit_id: string | null;
  event_date: string | null;
  n_laps: number;
}

export function ReplayPicker() {
  const { data, isLoading } = useQuery({
    queryKey: ["replay", "list"],
    queryFn: () => api.get<ReplayEntry[]>("/api/replay"),
    staleTime: 60 * 60 * 1000,
  });

  const seasons = useMemo(
    () => Array.from(new Set((data ?? []).map(e => e.season))).sort((a, b) => b - a),
    [data],
  );
  const [season, setSeason] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const all = data ?? [];
    const activeSeason = season ?? seasons[0];
    let out = all.filter(e => e.season === activeSeason);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(e =>
        e.race_name.toLowerCase().includes(q) ||
        (e.circuit_id ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [data, season, search, seasons]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Race Replay</CardTitle>
        <CardDescription>
          No live session right now — replay any completed race. Each replay drives the full
          timing tower, track map and a re-running win-probability chart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {isLoading && <Skeleton className="h-7 w-32" />}
          {!isLoading && seasons.map((s) => {
            const active = (season ?? seasons[0]) === s;
            return (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-mono",
                  active
                    ? "border-f1-red text-f1-red bg-f1-red/10"
                    : "border-f1-edge text-f1-muted hover:text-f1-white",
                )}
              >
                {s}
              </button>
            );
          })}
          <div className="ml-auto w-full sm:w-56 relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-f1-muted" />
            <Input
              placeholder="Search races…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-f1-edge p-6 text-center text-xs text-f1-muted">
            No replays match.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((e) => (
              <Link
                key={`${e.season}-${e.round}`}
                to={`/replay/${e.season}/${e.round}`}
                className="group rounded-md border border-f1-edge bg-f1-panel/40 px-3 py-2 hover:border-f1-red/50 hover:bg-f1-red/5 transition-colors flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.race_name}</div>
                  <div className="text-[10px] text-f1-muted truncate">
                    Round {e.round} · {e.n_laps} laps {e.event_date ? `· ${e.event_date}` : ""}
                  </div>
                </div>
                <Badge tone="muted" className="shrink-0">
                  {e.season}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

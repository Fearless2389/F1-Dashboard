import { useQuery } from "@tanstack/react-query";
import { Newspaper, Sparkles } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import type { RaceRecapResponse } from "@/lib/types";

interface Props {
  season: number;
  round: number;
  /** Show a compact variant (smaller padding, no card chrome) suited to the
   *  Calendar's expanded panel and the Standings hero callout. */
  variant?: "full" | "compact";
}

/**
 * Race recap card — fetches /api/replay/{season}/{round}/recap and renders
 * the templated headline, lead paragraph, and highlight chips returned by
 * the backend. Hides itself gracefully if the round has no race data yet.
 *
 * Used in three places: the Replay page footer, the Standings hero, and
 * the Calendar's expanded view for past races.
 */
export function RaceRecapCard({ season, round, variant = "full" }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["recap", season, round],
    queryFn: () => api.get<RaceRecapResponse>(`/api/replay/${season}/${round}/recap`),
    retry: false,
    staleTime: 60 * 60_000,
  });

  if (isLoading) {
    return variant === "compact"
      ? <Skeleton className="h-24 w-full" />
      : <Card><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>;
  }

  if (isError || !data) return null;

  const body = (
    <>
      <h3 className="font-display font-bold text-xl md:text-2xl leading-tight tracking-tight text-f1-white mb-3">
        {data.headline}
      </h3>
      <p className="text-sm text-f1-muted leading-relaxed max-w-3xl">
        {data.lead}
      </p>
      {data.highlights.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.highlights.map((h, i) => (
            <div
              key={`${h.label}-${i}`}
              className="rounded-md border border-f1-edge bg-f1-panel/60 px-3 py-1.5 flex items-center gap-2"
            >
              <Sparkles size={11} className="text-paddock-coral shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-f1-muted font-semibold leading-none">
                  {h.label}
                </span>
                <span className="text-xs text-f1-white leading-tight mt-0.5">
                  {h.text}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (variant === "compact") {
    return <div className="px-4 py-3">{body}</div>;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Newspaper size={16} className="text-paddock-coral" />
          Race recap
        </CardTitle>
        <CardDescription>
          Auto-generated from race results + the replay overtake feed
        </CardDescription>
      </CardHeader>
      <CardContent>
        {body}
      </CardContent>
    </Card>
  );
}

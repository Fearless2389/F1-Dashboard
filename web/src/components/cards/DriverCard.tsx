import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { teamColorFallback } from "@/lib/teams";
import { cn } from "@/lib/cn";

interface Props {
  card: {
    driver_code: string;
    driver_number: number | null;
    full_name: string | null;
    team_name: string | null;
    team_colour: string | null;
    headshot_url: string | null;
    nationality: string | null;
    country_name: string | null;
    season_points: number;
    championship_position: number | null;
  };
  season: number;
}

/**
 * Map ISO 3166-1 alpha-3 → alpha-2 for the regional-indicator flag emoji.
 * Tiny lookup since we only have ~20 nationalities on the grid.
 */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  NED: "NL", GBR: "GB", AUS: "AU", MON: "MC", ITA: "IT", ESP: "ES", CAN: "CA",
  FRA: "FR", NZL: "NZ", THA: "TH", GER: "DE", BRA: "BR", JPN: "JP", USA: "US",
  ARG: "AR", FIN: "FI", DEN: "DK", BEL: "BE", MEX: "MX", POL: "PL", CHN: "CN",
};

function flagEmoji(alpha3: string | null): string {
  if (!alpha3) return "🏁";
  const alpha2 = ALPHA3_TO_ALPHA2[alpha3.toUpperCase()];
  if (!alpha2) return "🏁";
  return String.fromCodePoint(
    ...[...alpha2.toUpperCase()].map(c => 127397 + c.charCodeAt(0)),
  );
}

export function DriverCard({ card, season }: Props) {
  const teamColour = teamColorFallback(card.team_colour, card.team_name);
  const [imgErr, setImgErr] = useState(false);

  return (
    <Link to={`/driver/${card.driver_code}?season=${season}`}>
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className={cn(
          "group relative rounded-xl border border-f1-edge bg-f1-panel/70 overflow-hidden",
          "hover:border-f1-red/40 transition-colors",
          "shadow-[0_4px_24px_-12px_rgba(0,0,0,0.6)]",
        )}
      >
        {/* Team colour bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ background: teamColour }}
        />

        {/* Headshot */}
        <div className="flex items-start gap-3 pl-4 pr-3 pt-3">
          <div
            className="relative h-16 w-16 rounded-md overflow-hidden shrink-0 border border-f1-edge"
            style={{ background: `${teamColour}22` }}
          >
            {card.headshot_url && !imgErr ? (
              <img
                src={card.headshot_url}
                alt={card.full_name ?? card.driver_code}
                className="h-full w-full object-cover"
                onError={() => setImgErr(true)}
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xl font-bold text-f1-muted">
                {card.driver_code}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span>{flagEmoji(card.nationality)}</span>
              <span className="text-f1-muted truncate">{card.country_name ?? card.nationality ?? "—"}</span>
            </div>
            <div className="font-display text-xl font-semibold leading-tight truncate mt-0.5 tracking-tight">
              {card.full_name ?? card.driver_code}
            </div>
            <div className="text-xs text-f1-muted truncate">{card.team_name}</div>
          </div>
          <div className="text-3xl font-black tabular-nums leading-none" style={{ color: teamColour }}>
            {card.driver_number ?? "—"}
          </div>
        </div>

        {/* Stats footer */}
        <div className="grid grid-cols-3 gap-2 p-3 mt-2">
          <div className="rounded-md bg-f1-dark/60 border border-f1-edge p-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-f1-muted">Pts</div>
            <div className="text-base font-semibold tabular-nums mt-0.5">
              {Math.round(card.season_points)}
            </div>
          </div>
          <div className="rounded-md bg-f1-dark/60 border border-f1-edge p-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-f1-muted">Champ</div>
            <div className="text-base font-semibold tabular-nums mt-0.5">
              {card.championship_position ? `P${card.championship_position}` : "—"}
            </div>
          </div>
          <div className="rounded-md bg-f1-dark/60 border border-f1-edge p-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-f1-muted">Code</div>
            <div className="text-base font-semibold font-mono mt-0.5">{card.driver_code}</div>
          </div>
        </div>

        {/* Hover indicator */}
        <Badge tone="muted" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          View →
        </Badge>
      </motion.div>
    </Link>
  );
}

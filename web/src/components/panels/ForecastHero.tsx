import { teamColorFallback } from "@/lib/teams";
import type { ForecastTopPick } from "@/lib/types";

interface Props {
  pole: ForecastTopPick;
  winner: ForecastTopPick;
}

/**
 * Two side-by-side cards modelled on the PREQ-V1.0 reference: Predicted Pole
 * on the left, Predicted Winner on the right. Each shows an italic Playfair
 * driver name, team · code subtitle, and a big percentage labelled Confidence
 * (pole) or Win Probability (winner). Both confidences come from the
 * simulator's position-distribution (P1 column for both, since pole isn't
 * separately simulated yet).
 */
export function ForecastHero({ pole, winner }: Props) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <ForecastHeroCard
        kicker="PREDICTED POLE"
        label="CONFIDENCE"
        pick={pole}
      />
      <ForecastHeroCard
        kicker="PREDICTED WINNER"
        label="WIN PROBABILITY"
        pick={winner}
      />
    </div>
  );
}

export function ForecastHeroCard({
  kicker, label, pick,
}: {
  kicker: string;
  label: string;
  pick: ForecastTopPick;
}) {
  const color = teamColorFallback(pick.team_colour, pick.team_name);
  const pct = Math.round((pick.prob || 0) * 100);
  return (
    <div className="relative overflow-hidden rounded-xl border border-f1-edge bg-paddock-panel p-5 md:p-6">
      {/* Driver-colour accent stripe — replaces the old full-card */}
      {/* gradient wash for a more deliberate signal. */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: color }}
        aria-hidden
      />
      <div className="text-[10px] uppercase tracking-widest text-paddock-coral font-semibold">
        {kicker}
      </div>

      {/* Solid driver name — the previous gradient text-fill (white →
          team-colour) faded into invisibility against the dark-tinted panel
          for several drivers, making the team subtitle below read as the
          headline identifier. */}
      <h2 className="font-display font-black italic text-3xl md:text-5xl tracking-tight leading-[0.95] mt-3 text-f1-white">
        {pick.full_name ?? pick.driver_code}
      </h2>

      <div className="text-[11px] uppercase tracking-widest text-f1-muted mt-2 flex items-center gap-1.5">
        <span className="h-2 w-1 rounded-sm" style={{ background: color }} />
        <span style={{ color }} className="font-semibold">{pick.driver_code}</span>
        <span className="text-f1-muted">· {pick.team_name ?? "—"}</span>
      </div>

      <div className="flex items-baseline justify-between mt-6 border-t border-f1-edge/60 pt-3">
        <span className="text-[10px] uppercase tracking-widest text-f1-muted">{label}</span>
        <span className="font-display font-black text-paddock-coral text-3xl md:text-4xl tabular-nums leading-none">
          {pct}%
        </span>
      </div>
    </div>
  );
}

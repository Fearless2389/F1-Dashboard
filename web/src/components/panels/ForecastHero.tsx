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
      <HeroCard
        kicker="PREDICTED POLE"
        label="CONFIDENCE"
        pick={pole}
      />
      <HeroCard
        kicker="PREDICTED WINNER"
        label="WIN PROBABILITY"
        pick={winner}
      />
    </div>
  );
}

function HeroCard({
  kicker, label, pick,
}: {
  kicker: string;
  label: string;
  pick: ForecastTopPick;
}) {
  const color = teamColorFallback(pick.team_colour, pick.team_name);
  const pct = Math.round((pick.prob || 0) * 100);
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-f1-edge bg-paddock-panel/80 p-5 md:p-6"
      style={{
        background:
          `linear-gradient(120deg, ${color}1a 0%, transparent 60%), ` +
          "var(--color-paddock-panel)",
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-paddock-coral font-semibold">
        {kicker}
      </div>

      <h2
        className="font-display font-black italic text-3xl md:text-5xl tracking-tight leading-[0.95] mt-3"
        style={{
          background: `linear-gradient(110deg, #f5f5f7 0%, ${color} 90%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {pick.full_name ?? pick.driver_code}
      </h2>

      <div className="text-[11px] uppercase tracking-widest text-f1-muted mt-2 flex items-center gap-1.5">
        <span className="h-2 w-1 rounded-sm" style={{ background: color }} />
        {pick.team_name ?? "—"} · {pick.driver_code}
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

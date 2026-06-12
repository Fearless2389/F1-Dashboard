import { teamColorFallback } from "@/lib/teams";
import { cn } from "@/lib/cn";
import { GlossaryTerm } from "@/lib/glossary";
import type { ForecastDriver } from "@/lib/types";

interface Props {
  drivers: ForecastDriver[];     // already ordered by expected_position
}

const BLANK_THRESHOLD = 0.05;     // hide cells with probability < 5%

/**
 * Full 20-driver × 20-position distribution matrix + a separate DNF column.
 * Row N column K means "in our 10K simulations, driver N finished at
 * position K this often". The DNF column carries the share of simulations
 * where the car retired, kept distinct from finishing positions so a
 * fragile driver doesn't bleed mass into P20 (the old "DNF → P20" hack
 * skewed every row toward the right edge).
 *
 * Cell value: round(P × 100). Cells below the BLANK_THRESHOLD are left
 * empty so the eye reads only the meaningful mass; colour intensity is
 * sqrt-gamma-corrected so tails still register at lower opacities. Each
 * row gets a small team-colour stripe on the leftmost column for fast
 * scanning, and the DNF column uses a cyan tint so it can't be mistaken
 * for a P20 finish.
 */
export function DistributionMatrix({ drivers }: Props) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5 text-sm text-f1-muted">
        No simulation data.
      </div>
    );
  }

  // Column count adapts to the field — 22 in 2026 (Cadillac entry), 20 in
  // prior seasons. Reading the length from the API response means the matrix
  // never silently clips P21/P22 into the rightmost column.
  const nPositions = drivers[0]?.position_distribution?.length ?? 20;

  return (
    <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          Full Distribution Matrix · {nPositions} positions + DNF
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-[10px] font-mono w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-paddock-panel/95 text-left text-[9px] uppercase tracking-widest text-f1-muted px-2 py-2">
                Driver
              </th>
              {Array.from({ length: nPositions }, (_, i) => (
                <th
                  key={i}
                  className="text-[9px] uppercase tracking-widest text-f1-muted text-center px-1.5 py-2 min-w-[28px]"
                >
                  P{i + 1}
                </th>
              ))}
              <th
                className="text-[9px] uppercase tracking-widest text-paddock-amber text-center px-1.5 py-2 min-w-[32px] border-l border-f1-edge/60"
                title="Share of simulations in which the car retired"
              >
                DNF
              </th>
            </tr>
          </thead>
          <tbody>
            {drivers.map(d => {
              const color = teamColorFallback(d.team_colour, d.team_name);
              const dnf = d.dnf_prob ?? 0;
              const showDnf = dnf >= BLANK_THRESHOLD;
              const dnfValue = Math.round(dnf * 100);
              const dnfIntensity = Math.min(1, Math.sqrt(dnf / 0.4));
              return (
                <tr key={d.driver_code} className="border-t border-f1-edge/30">
                  <td className="sticky left-0 z-10 bg-paddock-panel/95 text-left px-2 py-1.5 border-t border-f1-edge/30">
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-1 rounded-sm shrink-0" style={{ background: color }} />
                      <span className="font-mono text-f1-white">{d.driver_code}</span>
                      <span className="text-f1-muted text-[9px] uppercase tracking-widest hidden sm:inline">
                        {d.team_name ?? ""}
                      </span>
                    </div>
                  </td>
                  {Array.from({ length: nPositions }, (_, i) => {
                    const p = d.position_distribution?.[i] ?? 0;
                    const showCell = p >= BLANK_THRESHOLD;
                    const value = Math.round(p * 100);
                    // Gamma-corrected intensity so a 6% cell isn't washed out.
                    const intensity = Math.min(1, Math.sqrt(p / 0.4));
                    return (
                      <td
                        key={i}
                        className={cn(
                          "border-t border-f1-edge/30 text-center tabular-nums px-1 py-1.5",
                          showCell ? "text-f1-white" : "text-f1-muted/0",
                        )}
                        style={{
                          background: showCell
                            ? `rgba(255, 94, 108, ${0.10 + intensity * 0.55})`
                            : "transparent",
                        }}
                      >
                        {showCell ? value : ""}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "border-t border-f1-edge/30 border-l border-f1-edge/60 text-center tabular-nums px-1 py-1.5",
                      showDnf ? "text-paddock-amber font-semibold" : "text-f1-muted/0",
                    )}
                    style={{
                      background: showDnf
                        ? `rgba(245, 184, 0, ${0.08 + dnfIntensity * 0.42})`
                        : "transparent",
                    }}
                    title={`${dnfValue}% of simulations retire`}
                  >
                    {showDnf ? dnfValue : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-f1-muted/80">
        Cell value = round(P × 100). Each finishing row sums to (100 − DNF%); the cyan{" "}
        <GlossaryTerm term="dnf">DNF</GlossaryTerm> column on the right is the share of{" "}
        <GlossaryTerm term="monte-carlo">simulations</GlossaryTerm> where the car retired. Cells
        below 5% are blank; the coral scale is gamma-corrected so sub-threshold tails still register.
      </div>
    </div>
  );
}

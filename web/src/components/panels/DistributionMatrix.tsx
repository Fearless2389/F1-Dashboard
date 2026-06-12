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
 * fragile driver doesn't bleed mass into P20.
 *
 * Visual register: FIA timing-screen — no border-radius anywhere, every
 * column separated by a 1px ruled gutter (not padding), every row by a
 * 1px rule, ALLCAPS mono headers with wide letter-spacing, no zebra
 * stripes. The numbers are meant to feel punishing rather than
 * comfortable; the surface is data-as-record, not data-as-art.
 *
 * Cell value: round(P × 100). Cells below the BLANK_THRESHOLD are left
 * empty so the eye reads only the meaningful mass; colour intensity is
 * sqrt-gamma-corrected so tails still register at lower opacities. The
 * DNF column uses an amber tint so it can't be mistaken for a P20 finish.
 */
export function DistributionMatrix({ drivers }: Props) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="border border-f1-edge bg-paddock-panel p-5 text-sm text-f1-muted">
        No simulation data.
      </div>
    );
  }

  // Column count adapts to the field — 22 in 2026 (Cadillac entry), 20 in
  // prior seasons. Reading the length from the API response means the matrix
  // never silently clips P21/P22 into the rightmost column.
  const nPositions = drivers[0]?.position_distribution?.length ?? 20;

  // ─ FIA-screen layout knobs ────────────────────────────────────────
  const RULE = "rgba(237, 228, 211, 0.12)";  // cream/12 — the column gutter
  const STRONG_RULE = "rgba(237, 228, 211, 0.25)";

  return (
    <div className="border border-f1-edge bg-paddock-panel">
      {/* Top strip — FIA-style label band with the column counts */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b" style={{ borderColor: STRONG_RULE }}>
        <span className="text-[9px] uppercase tracking-[0.22em] text-paddock-cream font-semibold font-mono">
          FULL DISTRIBUTION · {nPositions} POS + DNF
        </span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-f1-muted font-mono">
          P(FINISH) × 100
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-[10px] font-mono w-full">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 bg-paddock-panel text-left text-[9px] uppercase tracking-[0.18em] text-paddock-cream/85 font-semibold px-3 py-2"
                style={{
                  borderRight: `1px solid ${STRONG_RULE}`,
                  borderBottom: `1px solid ${STRONG_RULE}`,
                  width: "12ch",
                }}
              >
                Driver
              </th>
              {Array.from({ length: nPositions }, (_, i) => (
                <th
                  key={i}
                  className="text-[9px] uppercase tracking-[0.15em] text-paddock-cream/75 font-semibold text-center px-0 py-2"
                  style={{
                    width: "3ch",
                    minWidth: "3ch",
                    borderRight: `1px solid ${RULE}`,
                    borderBottom: `1px solid ${STRONG_RULE}`,
                  }}
                >
                  P{i + 1}
                </th>
              ))}
              <th
                className="text-[9px] uppercase tracking-[0.18em] text-paddock-amber font-semibold text-center px-0 py-2"
                style={{
                  width: "3ch",
                  minWidth: "3ch",
                  borderLeft: `1px solid ${STRONG_RULE}`,
                  borderBottom: `1px solid ${STRONG_RULE}`,
                }}
                title="Share of simulations in which the car retired"
              >
                DNF
              </th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, rowIdx) => {
              const color = teamColorFallback(d.team_colour, d.team_name);
              const dnf = d.dnf_prob ?? 0;
              const showDnf = dnf >= BLANK_THRESHOLD;
              const dnfValue = Math.round(dnf * 100);
              const dnfIntensity = Math.min(1, Math.sqrt(dnf / 0.4));
              return (
                <tr
                  key={d.driver_code}
                  className="group"
                >
                  <td
                    className="sticky left-0 z-10 bg-paddock-panel text-left px-3 py-1.5 relative"
                    style={{
                      borderRight: `1px solid ${STRONG_RULE}`,
                      borderBottom: rowIdx < drivers.length - 1 ? `1px solid ${RULE}` : "none",
                    }}
                  >
                    {/* Hover indicator — coral left-edge flash, no row bg */}
                    <span
                      className="absolute left-0 top-0 bottom-0 w-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "var(--color-paddock-coral)" }}
                      aria-hidden
                    />
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-[2px] shrink-0" style={{ background: color }} />
                      <span className="text-f1-white">{d.driver_code}</span>
                      <span className="text-f1-muted text-[9px] uppercase tracking-[0.18em] hidden md:inline">
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
                          "text-center tabular-nums px-0 py-1.5",
                          showCell ? "text-f1-white" : "text-f1-muted/0",
                        )}
                        style={{
                          background: showCell
                            ? `rgba(255, 94, 108, ${0.10 + intensity * 0.55})`
                            : "transparent",
                          borderRight: `1px solid ${RULE}`,
                          borderBottom: rowIdx < drivers.length - 1 ? `1px solid ${RULE}` : "none",
                        }}
                      >
                        {showCell ? value : ""}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "text-center tabular-nums px-0 py-1.5",
                      showDnf ? "text-paddock-amber font-semibold" : "text-f1-muted/0",
                    )}
                    style={{
                      background: showDnf
                        ? `rgba(245, 184, 0, ${0.08 + dnfIntensity * 0.42})`
                        : "transparent",
                      borderLeft: `1px solid ${STRONG_RULE}`,
                      borderBottom: rowIdx < drivers.length - 1 ? `1px solid ${RULE}` : "none",
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

      <div className="px-4 py-3 text-[10px] text-f1-muted/80 leading-relaxed border-t" style={{ borderColor: STRONG_RULE }}>
        Cell value = round(P × 100). Each finishing row sums to (100 − DNF%); the amber{" "}
        <GlossaryTerm term="dnf">DNF</GlossaryTerm> column on the right is the share of{" "}
        <GlossaryTerm term="monte-carlo">simulations</GlossaryTerm> where the car retired. Cells
        below 5% are blank; the coral scale is gamma-corrected so sub-threshold tails still register.
      </div>
    </div>
  );
}

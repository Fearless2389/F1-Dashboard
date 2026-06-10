import { teamColorFallback } from "@/lib/teams";
import { cn } from "@/lib/cn";
import type { ForecastDriver } from "@/lib/types";

interface Props {
  drivers: ForecastDriver[];     // already ordered by expected_position
}

const N_POSITIONS = 20;
const BLANK_THRESHOLD = 0.05;     // hide cells with probability < 5%

/**
 * Full 20-driver × 20-position distribution matrix. Row N column K means
 * "in our 10K simulations, driver N finished at position K this often".
 *
 * Cell value: round(P × 100). Cells below the BLANK_THRESHOLD are left empty
 * so the eye reads only the meaningful mass; colour intensity is
 * sqrt-gamma-corrected so tails still register at lower opacities. Each row
 * gets a small team-colour stripe on the leftmost column for fast scanning.
 *
 * DNFs are bucketed into the rightmost column (P20) in the simulator — that
 * column will look "hotter" than the others for low-reliability drivers.
 */
export function DistributionMatrix({ drivers }: Props) {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5 text-sm text-f1-muted">
        No simulation data.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          Full Distribution Matrix · 20 × 20
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-[10px] font-mono w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-paddock-panel/95 text-left text-[9px] uppercase tracking-widest text-f1-muted px-2 py-2">
                Driver
              </th>
              {Array.from({ length: N_POSITIONS }, (_, i) => (
                <th
                  key={i}
                  className="text-[9px] uppercase tracking-widest text-f1-muted text-center px-1.5 py-2 min-w-[28px]"
                >
                  P{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map(d => {
              const color = teamColorFallback(d.team_colour, d.team_name);
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
                  {Array.from({ length: N_POSITIONS }, (_, i) => {
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-f1-muted/80">
        Cell value = round(P × 100). Cells below 5% are blank; colour scale is gamma-corrected so sub-threshold tails still register. DNF probability lands in the rightmost column (P20).
      </div>
    </div>
  );
}

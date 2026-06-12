import { useMemo } from "react";
import { m } from "framer-motion";
import { Info } from "lucide-react";

interface RadarValues {
  qualifying: number;
  race_pace: number;
  tyre_mgmt: number;
  consistency: number;
  overtaking: number;
}

interface Props {
  driverCode: string;
  values?: RadarValues | null;
  /** Compare-season overlay — rendered as a cream outline marker on each bar. */
  compareValues?: RadarValues | null;
  primaryLabel?: string;
  compareLabel?: string;
}

/**
 * Asymmetric Differential Performance Strip — horizontal divergent bars
 * centred on team-mate parity (50%).
 *
 * Every axis in the underlying radar is already a 0–100 H2H measurement
 * where 50 = parity with team-mate, >50 = ahead, <50 = behind. The strip
 * plots `value − 50` as a signed displacement (`-50 ←→ +50 pp`).
 *
 * Visual reference: 1990s–2000s Autosport magazine technical data blocks
 * and engineering telemetry printouts — rigid vertical spine at parity,
 * razor-thin horizontal ticks, ALLCAPS mono labels, hard 1px rules
 * between structural tiers.
 *
 * Three structural tiers group the metrics by what they measure:
 *   - SINGLE-LAP EXECUTION — Qualifying
 *   - RACE TRIM            — Race Pace, Consistency, Tyre Management
 *   - WHEEL-TO-WHEEL       — Overtaking
 *
 * For drivers with no team-mate baseline (rookies in their first race,
 * solo entries in historical data) the parent component falls back to
 * the original radar chart — this strip is purely the H2H read.
 */

// ── Layout tokens ────────────────────────────────────────────────────────────
const SPINE_X = 50;          // % from left where parity sits
const SCALE_HALF = 40;       // ± pp the strip covers (clipping past this is fine)
const ROW_H = 36;            // px per metric row
const BAR_H = 14;            // px tall

interface Metric {
  key: keyof RadarValues;
  label: string;
  tier: "EXEC" | "TRIM" | "W2W";
}

const METRICS: Metric[] = [
  { key: "qualifying",  label: "Qualifying",  tier: "EXEC" },
  { key: "race_pace",   label: "Race Pace",   tier: "TRIM" },
  { key: "consistency", label: "Consistency", tier: "TRIM" },
  { key: "tyre_mgmt",   label: "Tyre Mgmt",   tier: "TRIM" },
  { key: "overtaking",  label: "Overtaking",  tier: "W2W"  },
];

const TIER_LABEL: Record<Metric["tier"], string> = {
  EXEC: "Single-lap execution",
  TRIM: "Race trim",
  W2W:  "Wheel-to-wheel",
};

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

/** Convert a 0-100 value into a left%/width% pair around the parity spine. */
function barGeometry(value: number) {
  const delta = clamp(value - 50, -SCALE_HALF, SCALE_HALF);
  const widthPct = (Math.abs(delta) / SCALE_HALF) * SPINE_X;
  if (delta >= 0) return { leftPct: SPINE_X, widthPct, sign: "+" as const };
  return { leftPct: SPINE_X - widthPct, widthPct, sign: "−" as const };
}

function formatDelta(value: number) {
  const d = value - 50;
  const sign = d >= 0 ? "+" : "−";
  return `${sign}${Math.abs(d).toFixed(1)}`;
}

export function PerformanceStrip({
  driverCode, values, compareValues, primaryLabel, compareLabel,
}: Props) {
  const meanDelta = useMemo(() => {
    if (!values) return 0;
    const d = METRICS.map(m => (values[m.key] ?? 50) - 50);
    return d.reduce((a, b) => a + b, 0) / d.length;
  }, [values]);

  const status = (() => {
    if (meanDelta >= 8)   return { label: "Ahead of baseline",  tone: "ahead" as const };
    if (meanDelta <= -8)  return { label: "Behind baseline",    tone: "behind" as const };
    return { label: "At baseline", tone: "parity" as const };
  })();

  const statusColor = {
    ahead:  "var(--color-paddock-mint)",
    parity: "var(--color-paddock-cream)",
    behind: "var(--color-paddock-coral)",
  }[status.tone];

  // Group metrics by tier so we can interleave the tier-rule headers
  const tiers: Array<{ tier: Metric["tier"]; rows: Metric[] }> = [];
  for (const m of METRICS) {
    const last = tiers[tiers.length - 1];
    if (last && last.tier === m.tier) last.rows.push(m);
    else tiers.push({ tier: m.tier, rows: [m] });
  }

  return (
    <div className="border border-f1-edge bg-paddock-panel p-5">
      {/* ── Header strip ──────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3 mb-4 pb-3 border-b border-paddock-cream/70">
        <div>
          <div className="text-[9px] uppercase tracking-[0.22em] text-f1-muted font-semibold mb-1 flex items-center gap-1">
            Performance Strip
            <span
              className="inline-flex"
              title={
                "Horizontal divergent display centred on team-mate parity (50%).\n" +
                "Bar to the right = driver ahead of team-mate on this axis.\n" +
                "Bar to the left  = driver behind team-mate.\n" +
                "Scale: ±40 percentage points around parity."
              }
            >
              <Info size={10} />
            </span>
          </div>
          <div className="font-display font-bold italic text-xl text-f1-white tracking-tight leading-none">
            {driverCode}
          </div>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-paddock-cream/85">
          <div>vs Team-mate</div>
          {compareLabel && primaryLabel && (
            <div className="mt-0.5 text-paddock-cream">
              {primaryLabel} <span className="text-f1-muted">→</span> {compareLabel}
            </div>
          )}
        </div>
      </div>

      {/* ── Metric rows ───────────────────────────────────────────── */}
      <div className="space-y-0">
        {tiers.map((group, gi) => (
          <div key={group.tier}>
            {/* Tier rule + label */}
            <div className="flex items-center gap-3 mt-3 first:mt-0 mb-2">
              <div className="text-[9px] uppercase tracking-[0.22em] text-paddock-cream/75 font-semibold whitespace-nowrap">
                {TIER_LABEL[group.tier]}
              </div>
              <div className="flex-1 h-px bg-paddock-cream/15" />
            </div>

            {group.rows.map(metric => {
              const v = values?.[metric.key] ?? 50;
              const cv = compareValues?.[metric.key];
              const { leftPct, widthPct, sign } = barGeometry(v);
              const isAhead = v >= 50;
              const barColor = isAhead ? "var(--color-paddock-mint)" : "var(--color-paddock-coral)";

              return (
                <div
                  key={metric.key}
                  className="grid grid-cols-[100px_1fr_56px] gap-3 items-center"
                  style={{ height: ROW_H }}
                >
                  {/* Label */}
                  <div className="text-[11px] uppercase tracking-[0.12em] font-medium text-f1-white/90 truncate font-mono">
                    {metric.label}
                  </div>

                  {/* Bar track */}
                  <div className="relative h-full flex items-center">
                    {/* Tick marks at -40/-20/0/+20/+40 */}
                    <div className="absolute inset-x-0 inset-y-0 pointer-events-none">
                      {[-40, -20, 20, 40].map(t => {
                        const x = SPINE_X + (t / SCALE_HALF) * SPINE_X;
                        return (
                          <div
                            key={t}
                            className="absolute top-1/2 -translate-y-1/2 h-2 w-px bg-f1-muted/25"
                            style={{ left: `${x}%` }}
                            aria-hidden
                          />
                        );
                      })}
                    </div>
                    {/* Spine = parity */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-paddock-cream"
                      style={{ left: `${SPINE_X}%` }}
                      aria-hidden
                    />
                    {/* Primary bar */}
                    <m.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ type: "spring", stiffness: 170, damping: 24, delay: 0.05 + gi * 0.05 }}
                      className="absolute"
                      style={{
                        left: `${leftPct}%`,
                        height: BAR_H,
                        top: `calc(50% - ${BAR_H / 2}px)`,
                        background: barColor,
                      }}
                    />
                    {/* Compare-season outline marker — a thin cream tick at
                        the compare value's position. Lets eyeballs jump
                        between two seasons without overlapping bar fills. */}
                    {cv != null && (
                      <div
                        className="absolute"
                        style={{
                          left: `calc(${SPINE_X + ((cv - 50) / SCALE_HALF) * SPINE_X}% - 1px)`,
                          width: 2,
                          height: BAR_H + 6,
                          top: `calc(50% - ${(BAR_H + 6) / 2}px)`,
                          background: "var(--color-paddock-cream)",
                          opacity: 0.85,
                        }}
                        aria-hidden
                      />
                    )}
                  </div>

                  {/* Numeric delta */}
                  <div
                    className="text-right font-mono tabular-nums text-[12px] font-semibold leading-none"
                    style={{ color: isAhead ? "var(--color-paddock-mint)" : "var(--color-paddock-coral)" }}
                    title={sign === "+" ? "Ahead of team-mate" : "Behind team-mate"}
                  >
                    {formatDelta(v)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Axis legend ───────────────────────────────────────────── */}
      <div className="mt-3 pt-2 border-t border-f1-edge grid grid-cols-[100px_1fr_56px] gap-3 items-center">
        <div />
        <div className="relative h-3 font-mono text-[8px] text-f1-muted/80 uppercase tracking-[0.15em]">
          <span className="absolute left-0">−40</span>
          <span className="absolute left-1/4 -translate-x-1/2">−20</span>
          <span className="absolute left-1/2 -translate-x-1/2 text-paddock-cream">0</span>
          <span className="absolute left-3/4 -translate-x-1/2">+20</span>
          <span className="absolute right-0">+40</span>
        </div>
        <div />
      </div>
      <div className="mt-1 grid grid-cols-[100px_1fr_56px] gap-3">
        <div />
        <div className="text-center font-mono text-[8px] uppercase tracking-[0.2em] text-f1-muted">
          Δ vs Team-mate parity (pp)
        </div>
        <div />
      </div>

      {/* ── Footer: status + mean delta ───────────────────────────── */}
      <div className="mt-4 pt-3 border-t border-paddock-cream/70 grid grid-cols-2 gap-3 items-end">
        <div>
          <div className="text-[9px] uppercase tracking-[0.22em] text-f1-muted font-semibold">
            Status
          </div>
          <div
            className="mt-1 font-mono uppercase tracking-[0.14em] text-[11px] font-semibold"
            style={{ color: statusColor }}
          >
            {status.label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-[0.22em] text-f1-muted font-semibold">
            Mean Δ
          </div>
          <div
            className="mt-1 font-display font-bold tabular-nums text-2xl leading-none"
            style={{ color: statusColor }}
          >
            {meanDelta >= 0 ? "+" : "−"}{Math.abs(meanDelta).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

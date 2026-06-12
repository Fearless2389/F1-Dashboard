import { m, AnimatePresence } from "framer-motion";

import { teamColorFallback } from "@/lib/teams";
import type { LiveDriver } from "@/lib/types";

interface TowerDriver extends LiveDriver {
  /** Tyre age in laps (replay enrichment) */
  tyre_life?: number | null;
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DNF: { bg: "rgba(225,6,0,0.18)",  text: "#ff6b6b" },
  DNS: { bg: "rgba(138,138,163,0.18)", text: "#b0b0c8" },
};

interface Props {
  drivers: TowerDriver[];
  onSelectDriver?: (code: string) => void;
  selected?: string | null;
}

function compoundColor(c?: string | null) {
  switch ((c || "").toUpperCase()) {
    case "SOFT":         return "#e10600";
    case "MEDIUM":       return "#ffd200";
    case "HARD":         return "#f5f5f7";
    case "INTERMEDIATE": return "#43b02a";
    case "WET":          return "#0080ff";
    default:             return "#5a5a72";
  }
}

function compoundLabel(c?: string | null): string {
  switch ((c || "").toUpperCase()) {
    case "SOFT":         return "S";
    case "MEDIUM":       return "M";
    case "HARD":         return "H";
    case "INTERMEDIATE": return "I";
    case "WET":          return "W";
    case "SUPERSOFT":    return "SS";
    case "ULTRASOFT":    return "US";
    case "HYPERSOFT":    return "HS";
    default:             return "·";
  }
}

// ─ Pit-wall column layout ──────────────────────────────────────────
//
// Six fixed columns expressed in ch units so the grid reads as
// character-cell layout, not pixel grid:
//   P    │ Driver │ Gap   │ Int   │ Tyre   │ Pit
//   3ch  │ flex   │ 5ch   │ 5ch   │ 6ch    │ 3ch
//
// The mono digits line up across rows because every numeric column is
// width-locked in ch. Vertical 1px cream/12 rules between columns sell
// the pit-wall channel-divider affordance.
//
// The driver column shrinks slightly to give a few extra characters to
// Gap/Int — wide tracks with multi-second deltas (Spa rain finishes,
// etc.) need the headroom.

const GRID = "grid-cols-[3ch_1fr_6ch_6ch_7ch_3ch]";
const RULE = "rgba(237, 228, 211, 0.10)";
const STRONG = "rgba(237, 228, 211, 0.22)";

/**
 * Pit-wall timing tower.
 *
 * Visual reference: the engineer's pit-wall screen — single top rule
 * on the panel, no per-row card frame, ch-width columns separated by
 * 1px channel dividers, monospace throughout. The original information
 * (position, driver code, team, gap, interval, compound, tyre age, pit
 * count) is preserved — Gemini's prescription to strip everything down
 * to signed deltas would have been illegible to anyone who hasn't read
 * pit-wall radio chatter for a decade. We keep the data; we just
 * change the framing.
 *
 * Hover affordance: 2px coral left-edge flash on the row, no background
 * tint — matches the FIA-style distribution matrix + standings tables.
 */
export function TimingTower({ drivers, onSelectDriver, selected }: Props) {
  return (
    <div
      className="font-mono"
      role="grid"
      aria-label="Live timing tower — drivers ordered by current position"
      aria-rowcount={drivers.length + 1}
    >
      {/* Header rule strip — labels above a single STRONG cream rule. */}
      <div
        role="row"
        aria-rowindex={1}
        className={`grid ${GRID} gap-x-2 text-[10px] uppercase tracking-[0.16em] text-paddock-cream/85 font-semibold px-2 py-2.5`}
        style={{ borderBottom: `1px solid ${STRONG}` }}
      >
        <div role="columnheader">P</div>
        <div role="columnheader">Driver</div>
        <div role="columnheader" className="text-right">Gap</div>
        <div role="columnheader" className="text-right">Int</div>
        <div role="columnheader" className="text-right">Tyre</div>
        <div role="columnheader" className="text-right">Pit</div>
      </div>

      <div>
        <AnimatePresence initial={false}>
          {drivers.map((d, idx) => {
            const color = teamColorFallback(d.team_colour, d.team_name);
            const isSel = selected && selected === d.driver_code;
            const compColor = compoundColor(d.compound);
            const statusStyle = d.status ? STATUS_STYLE[d.status] : null;
            const dimmed = !!statusStyle;
            const isLast = idx === drivers.length - 1;
            return (
              <m.div
                key={d.driver_code || d.driver_number || Math.random()}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                onClick={() => onSelectDriver?.(d.driver_code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectDriver?.(d.driver_code);
                  }
                }}
                role="row"
                aria-rowindex={idx + 2}
                aria-selected={isSel ? true : undefined}
                aria-label={`P${d.position ?? "—"} ${d.driver_code}${d.team_name ? `, ${d.team_name}` : ""}${d.gap_to_leader ? `, gap ${d.gap_to_leader}` : ""}${d.compound ? `, ${d.compound} tyres` : ""}${d.tyre_life != null ? ` lap ${d.tyre_life}` : ""}`}
                tabIndex={0}
                className={[
                  "relative group grid", GRID,
                  "gap-x-2 items-center px-2 py-1.5 cursor-pointer",
                  dimmed ? "opacity-55" : "",
                ].join(" ")}
                style={{
                  borderBottom: isLast ? "none" : `1px solid ${RULE}`,
                }}
              >
                {/* Hover edge / active marker — coral 2px on left */}
                <span
                  aria-hidden
                  className={[
                    "absolute left-0 top-0 bottom-0 w-[2px] transition-opacity",
                    isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                  style={{ background: "var(--color-paddock-coral)" }}
                />

                {/* Position */}
                <div className="text-[13px] text-paddock-cream tabular-nums leading-none font-semibold">
                  {dimmed ? "—" : String(d.position ?? "—").padStart(2, " ")}
                </div>

                {/* Driver — team-colour stripe + code + team name */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-5 w-[2px] shrink-0"
                    style={{ background: color }}
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold leading-tight tracking-tight truncate text-f1-white">
                      {d.driver_code}
                    </div>
                    {/* Team name — sentence-case mono, no extreme    */}
                    {/* tracking. The earlier ALLCAPS tracking-widest */}
                    {/* register turned this line into a wall of      */}
                    {/* identical-width glyphs that the eye couldn't  */}
                    {/* skim — fine for a 3-letter driver code, ruin- */}
                    {/* ous for "Aston Martin Aramco Mercedes."       */}
                    <div className="text-[11px] text-f1-muted truncate leading-tight font-mono">
                      {d.team_name}
                    </div>
                  </div>
                </div>

                {statusStyle ? (
                  <div
                    className="col-span-2 text-[10px] text-center font-bold uppercase tracking-[0.18em] px-1 py-0.5"
                    style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.text}33` }}
                  >
                    {d.status}
                  </div>
                ) : (
                  <>
                    <div className="text-[12px] text-paddock-cream/85 text-right tabular-nums leading-tight font-semibold">
                      {d.gap_to_leader ?? "—"}
                    </div>
                    <div className="text-[12px] text-paddock-cream/85 text-right tabular-nums leading-tight font-semibold">
                      {d.interval ?? "—"}
                    </div>
                  </>
                )}

                {/* Tyre — broadcast-style colored ring + high-contrast    */}
                {/* letter + age in laps. The compound colour lives on the */}
                {/* RING (not the fill), so the letter inside is always    */}
                {/* on the same dark disc — M vs H stop reading identical  */}
                {/* at small sizes because the bright-yellow ring vs       */}
                {/* white ring is unmistakable even before you read the    */}
                {/* glyph. */}
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    className="inline-flex h-[22px] w-[22px] items-center justify-center text-[12px] font-bold shrink-0 leading-none rounded-full"
                    style={{
                      background: "#0c0e17",
                      color: "#f5f5f7",
                      border: `2.5px solid ${compColor}`,
                      boxShadow: `0 0 0 1px ${compColor}40`,
                    }}
                    title={d.compound ?? undefined}
                    aria-label={d.compound ?? "Unknown compound"}
                  >
                    {compoundLabel(d.compound)}
                  </span>
                  <span className="text-paddock-cream/80 text-[11px] tabular-nums font-semibold">
                    {d.tyre_life != null ? `L${d.tyre_life}` : "—"}
                  </span>
                </div>

                {/* Pit count */}
                <div className="text-[12px] text-paddock-cream/85 text-right tabular-nums leading-tight font-semibold">
                  {d.pit_count ?? 0}
                </div>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

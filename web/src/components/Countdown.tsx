import { useEffect, useState } from "react";
import { differenceInSeconds, parseISO } from "date-fns";

import { SplitFlapString } from "@/components/SplitFlapDigit";

interface Props {
  /** ISO timestamp to count down to. */
  target?: string | null;
  /** Optional label shown when the target is in the past. */
  pastLabel?: string;
  /** Compact mode shows only the largest 2 units. */
  compact?: boolean;
  /**
   * Visual treatment.
   *   - `text`      (default): plain mono digits, used inline.
   *   - `splitflap`: each digit is a Solari split-flap card. Reserved
   *     for the two big surfaces (NextRaceHero + Schedule page hero).
   * The split-flap variant ignores `className`'s font sizing — its
   * size is baked into the card preset.
   */
  variant?: "text" | "splitflap";
  /** Card preset for the splitflap variant. `lg` for heroes, `md` panels. */
  flapSize?: "md" | "lg";
  className?: string;
}

// Hoisted out of the component so we don't re-create it every tick.
const pad = (n: number) => n.toString().padStart(2, "0");

/**
 * Live-ticking countdown. Re-renders every second.
 *
 * Two visual treatments:
 *  - `text` (default) renders the digits inline so the parent owns the
 *    typography and colour. Used everywhere inline mono fits.
 *  - `splitflap` renders each character through SplitFlapDigit so digits
 *    rotate Solari-style on tick. Reserved for the hero countdowns
 *    (NextRaceHero + Schedule page) — applying it to every compact
 *    countdown on the site would over-animate.
 */
export function Countdown({
  target, pastLabel = "Session live", compact = false,
  variant = "text", flapSize = "lg", className,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return <span className={className}>—</span>;

  let dt: Date;
  try {
    dt = parseISO(target);
  } catch {
    return <span className={className}>—</span>;
  }

  const secs = differenceInSeconds(dt, new Date(now));
  if (secs <= 0) {
    if (variant === "splitflap") {
      // Render the "live" state as flap cards too so the transition from
      // "00m 02s" → "SESSION LIVE" looks like the same display, just
      // re-flapped. Pad to a fixed width so the layout doesn't jump.
      const text = pastLabel.toUpperCase();
      return <SplitFlapString text={text} size={flapSize} className={className} />;
    }
    return <span className={className}>{pastLabel}</span>;
  }

  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  // Format selection:
  //   text + compact   → "2d 14h" (largest 2 units, no leading zero on days)
  //   text + full      → "14h 12m 03s" (or "2d 14h 12m 03s")
  //   splitflap + any  → fixed-width "DD HH:MM:SS" or "HH:MM:SS" so the
  //                      flap array doesn't reflow on tick.
  if (variant === "splitflap") {
    // Always pad units to two digits so the card count never changes
    // mid-countdown (the AnimatePresence in SplitFlapDigit handles char
    // changes, but adding/removing cards would jitter the layout).
    const text = d > 0
      ? `${pad(d)}d ${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(h)}:${pad(m)}:${pad(s)}`;
    return <SplitFlapString text={text} size={flapSize} className={className} />;
  }

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  parts.push(`${pad(h)}h`);
  if (compact && parts.length >= 2) {
    parts.push(`${pad(m)}m`);
    return <span className={className}>{parts.join(" ")}</span>;
  }
  parts.push(`${pad(m)}m`);
  parts.push(`${pad(s)}s`);
  return <span className={className}>{parts.join(" ")}</span>;
}

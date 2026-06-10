import { useEffect, useState } from "react";
import { differenceInSeconds, parseISO } from "date-fns";

interface Props {
  /** ISO timestamp to count down to. */
  target?: string | null;
  /** Optional label shown when the target is in the past. */
  pastLabel?: string;
  /** Compact mode shows only the largest 2 units. */
  compact?: boolean;
  className?: string;
}

// Hoisted out of the component so we don't re-create it every tick.
const pad = (n: number) => n.toString().padStart(2, "0");

/**
 * Live-ticking countdown. Re-renders every second.
 * Displays as `2d 14h 12m 03s` (or `14h 12m 03s` once under a day).
 */
export function Countdown({ target, pastLabel = "Live now", compact = false, className }: Props) {
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
    return <span className={className}>{pastLabel}</span>;
  }

  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  // Show only the two largest units when compact
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

import { useEffect, useRef, useState } from "react";

/**
 * Number-tween hook for "this figure used to be X, now it's Y" moments —
 * driver points after a season switch, championship_position when the
 * round dropdown ticks, etc.
 *
 * The current value tweens from the previous value to the new target
 * over `durationMs`, using a requestAnimationFrame loop with an
 * ease-out cubic so the figure decelerates into its final state.
 *
 * No tween fires on the very first render (we just snap to the target)
 * — only subsequent changes animate, because the FIRST render is
 * usually "page just loaded, here's the number" which doesn't deserve
 * 600 ms of theatre.
 *
 * Returns the rounded integer current value so callers can drop it
 * straight into a tabular-nums slot.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      fromRef.current = target;
      setValue(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic — decelerates into the final value
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * eased;
      setValue(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return Math.round(value);
}

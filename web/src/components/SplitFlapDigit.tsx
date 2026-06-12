import { AnimatePresence, m } from "framer-motion";
import { cn } from "@/lib/cn";

interface Props {
  /** A single character — typically 0-9 or `:` */
  char: string;
  /**
   * Pixel size of the card. The digit scales to ~70% of the height.
   * Tuned via SIZE_SCALES below for both `lg` (hero) and `md` (panel)
   * preset usage.
   */
  size?: "md" | "lg";
  /**
   * Use a different palette for static separators (colons, unit
   * letters). Separators skip the flap animation and render flat to
   * keep the rhythm calm — flapping six digits is plenty.
   */
  separator?: boolean;
  className?: string;
}

const SIZE_SCALES = {
  md: { card: 28, height: 38, font: 24, gap: 1, perspective: 240 },
  lg: { card: 44, height: 60, font: 38, gap: 2, perspective: 380 },
};

/**
 * Solari split-flap card — single character. On every change the
 * outgoing glyph rotates forward and down (rotateX 0 → −90, pivot
 * around the horizontal mid-axis), while the incoming glyph rotates
 * up from below (rotateX 90 → 0). Both animations overlap, taking
 * ~200 ms total. The visual reference is the Solari di Udine departure
 * board — and old circuit timing scoreboards.
 *
 * Implementation notes:
 *   - The OUTER span carries `perspective` so the rotateX reads as 3D
 *     depth rather than a flat scaleY. Without this, the card just
 *     squashes vertically.
 *   - `backface-visibility: hidden` means once a glyph has rotated past
 *     90° in either direction it disappears — that's what gives the
 *     "edge-on, then gone" affordance.
 *   - The card body is warm graphite (#1a1a1a); the digit is cream;
 *     a 1 px black hairline at the midline sells the two-flap mechanism.
 *
 * Static separators (the colon between hours / minutes / seconds and
 * the unit letters like 'd') skip the rotation — flapping every
 * character at once would over-animate.
 */
export function SplitFlapDigit({ char, size = "lg", separator, className }: Props) {
  const dims = SIZE_SCALES[size];

  if (separator) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center font-mono font-bold leading-none select-none text-paddock-cream/85",
          className,
        )}
        style={{ width: dims.card * 0.5, height: dims.height, fontSize: dims.font }}
        aria-hidden
      >
        {char}
      </span>
    );
  }

  return (
    <span
      className={cn("relative inline-flex overflow-hidden select-none", className)}
      style={{
        width: dims.card,
        height: dims.height,
        background: "#1a1a1a",
        boxShadow:
          "inset 0 1px 0 0 rgba(255,255,255,0.04), 0 1px 0 0 rgba(0,0,0,0.5)",
        // perspective lives on the parent so the rotateX on the child
        // reads as actual 3D depth, not a scaleY squash.
        perspective: `${dims.perspective}px`,
        perspectiveOrigin: "50% 50%",
      }}
    >
      <AnimatePresence initial={false}>
        <m.span
          key={char}
          initial={{ rotateX: 90,  opacity: 0 }}
          animate={{ rotateX: 0,   opacity: 1 }}
          exit={{    rotateX: -90, opacity: 0 }}
          transition={{
            // ease in-out cubic — accelerates into the flap, decelerates
            // out of it, which matches mechanical flap physics.
            rotateX: { duration: 0.22, ease: [0.55, 0.05, 0.45, 0.95] },
            opacity: { duration: 0.16, ease: "easeOut" },
          }}
          className="absolute inset-0 flex items-center justify-center font-mono font-bold leading-none text-paddock-cream"
          style={{
            fontSize: dims.font,
            letterSpacing: "-0.02em",
            transformOrigin: "50% 50%",
            backfaceVisibility: "hidden",
            willChange: "transform",
          }}
        >
          {char}
        </m.span>
      </AnimatePresence>

      {/* Mid-card hairline — sells the "two flaps" affordance. Sits
          above both glyphs so the flap appears to pivot AT this line. */}
      <span
        className="absolute left-0 right-0 pointer-events-none z-10"
        style={{
          top: "50%",
          height: 1,
          background: "rgba(0,0,0,0.75)",
          boxShadow: "0 -1px 0 0 rgba(255,255,255,0.05)",
        }}
        aria-hidden
      />
    </span>
  );
}

/**
 * Helper: render a sequence of digits/separators inline with the right
 * gaps. Used by Countdown when `variant="splitflap"`.
 */
export function SplitFlapString({
  text, size = "lg", className,
}: {
  text: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const dims = SIZE_SCALES[size];
  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap: dims.gap }}>
      {[...text].map((c, i) => {
        const isSeparator = c === ":" || c === " " || c === "d" || c === "h" || c === "m" || c === "s";
        return (
          <SplitFlapDigit
            // Key by POSITION only so the same SplitFlapDigit instance
            // persists across ticks — the `char` prop change is what
            // triggers the AnimatePresence inside it. If we keyed by
            // `${i}-${c}` instead, React would tear down the component
            // on every digit change and the AnimatePresence would
            // never get a chance to fire.
            key={i}
            char={c}
            size={size}
            separator={isSeparator}
          />
        );
      })}
    </span>
  );
}

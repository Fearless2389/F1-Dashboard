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
   * Use a different palette for static separators (colons). Separators
   * skip the flap animation and render flat to keep the rhythm calm.
   */
  separator?: boolean;
  className?: string;
}

const SIZE_SCALES = {
  md: { card: 28, height: 38, font: 24, gap: 1 },
  lg: { card: 44, height: 60, font: 38, gap: 2 },
};

/**
 * Solari split-flap card — single character. On change the outgoing
 * char rotates down (top edge pivot, rotateX 0 → −90 over 130 ms) and
 * the incoming char rotates up from below (rotateX 90 → 0 over 130 ms).
 *
 * The midpoint hairline is rendered as a 1 px slot so two halves read
 * as a flap mechanism rather than a flat tile. The card body is warm
 * graphite (`#1a1a1a`); the digit is cream.
 *
 * Static separators (the colon between hours / minutes / seconds) skip
 * the rotation — animating six digits at once is plenty.
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
      className={cn(
        "relative inline-flex overflow-hidden select-none",
        className,
      )}
      style={{
        width: dims.card,
        height: dims.height,
        background: "#1a1a1a",
        boxShadow:
          "inset 0 1px 0 0 rgba(255,255,255,0.04), 0 1px 0 0 rgba(0,0,0,0.5)",
      }}
    >
      {/* Static char underneath — the "settled" state once animation
          ends. This avoids a flash of empty card between flips. */}
      <span
        className="absolute inset-0 flex items-center justify-center font-mono font-bold leading-none text-paddock-cream"
        style={{ fontSize: dims.font, letterSpacing: "-0.02em" }}
        aria-hidden
      >
        {char}
      </span>

      <AnimatePresence mode="popLayout">
        <m.span
          key={char}
          initial={{ rotateX: 90, opacity: 0 }}
          animate={{ rotateX: 0,  opacity: 1 }}
          exit={{    rotateX: -90, opacity: 0 }}
          transition={{ duration: 0.13, ease: [0.6, 0, 0.4, 1] }}
          className="absolute inset-0 flex items-center justify-center font-mono font-bold leading-none text-paddock-cream"
          style={{
            fontSize: dims.font,
            letterSpacing: "-0.02em",
            transformOrigin: "50% 50%",
            backfaceVisibility: "hidden",
          }}
        >
          {char}
        </m.span>
      </AnimatePresence>

      {/* Mid-card hairline — sells the "two flaps" affordance. */}
      <span
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          top: "50%",
          height: 1,
          background: "rgba(0,0,0,0.65)",
          boxShadow: "0 -1px 0 0 rgba(255,255,255,0.04)",
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
            // Use index as part of key so identical digits in different
            // positions remain stable.
            key={`${i}-${c}`}
            char={c}
            size={size}
            separator={isSeparator}
          />
        );
      })}
    </span>
  );
}

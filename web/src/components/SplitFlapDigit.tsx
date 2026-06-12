import { AnimatePresence, m } from "framer-motion";
import { cn } from "@/lib/cn";

interface Props {
  /** A single character — typically 0-9 or `:` */
  char: string;
  /**
   * Pixel size of the card. The digit scales to ~70% of the height.
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
 * Solari split-flap card — single character.
 *
 * Anatomy:
 *   - OUTER span: a dark "recess" / channel that the flap sits inside.
 *     Carries the `perspective` so child rotateX reads as 3D depth.
 *   - INNER m.span (per char): the actual flap *card face*. Has the
 *     panel background, the digit, and a midline hairline drawn on it.
 *     On every char change, this whole card face tips forward (rotateX
 *     0 → −90, pivot at the horizontal mid-axis) and the new card face
 *     rises from below (rotateX 90 → 0). Both animations overlap.
 *
 * The earlier version separated the panel background (static, on the
 * outer span) from the glyph (rotating, on the inner span). That made
 * the digit cartwheel inside a static frame instead of the whole flap
 * face physically flipping — fixed by putting the panel background on
 * the rotating element so it turns as a single unit.
 *
 * `transform-style: preserve-3d` on the outer span is critical for
 * Safari and certain Chromium builds — without it the child's rotateX
 * is flattened back to the parent's 2D plane before the perspective
 * has a chance to apply.
 *
 * Static separators (colons, unit letters) skip the rotation.
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
        // The recessed channel — slightly darker than the flap face so
        // the flap reads as a card sitting inside a slot.
        background: "#08090d",
        boxShadow:
          "inset 0 1px 2px 0 rgba(0,0,0,0.7), 0 1px 0 0 rgba(0,0,0,0.5)",
        perspective: `${dims.perspective}px`,
        perspectiveOrigin: "50% 50%",
        transformStyle: "preserve-3d",
      }}
    >
      <AnimatePresence initial={false}>
        <m.span
          key={char}
          initial={{ rotateX: 90,  opacity: 0.0 }}
          animate={{ rotateX: 0,   opacity: 1.0 }}
          exit={{    rotateX: -90, opacity: 0.0 }}
          transition={{
            rotateX: { duration: 0.26, ease: [0.55, 0.05, 0.45, 0.95] },
            opacity: { duration: 0.18, ease: "easeOut" },
          }}
          className="absolute inset-0 flex items-center justify-center font-mono font-bold leading-none text-paddock-cream"
          style={{
            // The flap card FACE — the rectangular tile that physically
            // tips forward. Background + midline hairline + digit all
            // belong to this single rotating element so they move as
            // one piece.
            background: "#1a1a1a",
            boxShadow:
              "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 2px 4px 0 rgba(0,0,0,0.55)",
            fontSize: dims.font,
            letterSpacing: "-0.02em",
            transformOrigin: "50% 50%",
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            willChange: "transform, opacity",
          }}
        >
          {char}
          {/* Midline hairline — sits on the flap face, so when the */}
          {/* flap rotates the hairline rotates with it. */}
          <span
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: "50%",
              height: 1,
              background: "rgba(0,0,0,0.75)",
              boxShadow: "0 -1px 0 0 rgba(255,255,255,0.05)",
            }}
            aria-hidden
          />
        </m.span>
      </AnimatePresence>
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
            // Key by POSITION only — the `char` prop change drives the
            // AnimatePresence inside each SplitFlapDigit.
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

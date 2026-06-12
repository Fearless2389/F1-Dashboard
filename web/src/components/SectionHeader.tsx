import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  /** Required title — rendered in italic Playfair display, full-bleed left. */
  title: ReactNode;
  /** Small uppercase eyebrow above the title (coral). */
  kicker?: ReactNode;
  /**
   * Top-right monospace indicator — the "issue number" of the section.
   * Examples: "RD.18", "SIM.10K", "Δ.2025v2024", "P4–P10".
   */
  index?: ReactNode;
  /** Optional one-line subtitle rendered below the rule. */
  description?: ReactNode;
  /**
   * Title size.
   *   - `sm` for in-card section dividers (~1.5rem)
   *   - `md` (default) for between-card sections (~2.25rem)
   *   - `lg` for hero-adjacent section openers (~3rem)
   */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const TITLE_SIZES = {
  sm: "text-2xl md:text-3xl",
  md: "text-3xl md:text-4xl",
  lg: "text-4xl md:text-5xl",
};

/**
 * Race-programme cover-grid section opener.
 *
 * Visual reference: 1980s–2000s Monaco GP programmes + Autosport yearbook
 * section dividers. An oversized italic Playfair title sits flush-left,
 * a 2px cream rule runs full-width underneath, and a small monospace
 * "issue number" lives in the opposite corner. The section is bounded by
 * rules — not by a card.
 *
 * The whole thing replaces the previous `text-sm uppercase tracking-widest`
 * kicker labels that read as SaaS-template "section title" and gave the
 * page no editorial weight.
 */
export function SectionHeader({
  title, kicker, index, description, size = "md", className,
}: Props) {
  return (
    <div className={cn("relative", className)}>
      {/* Top row — kicker on the left, index on the right. The index sits */}
      {/* on the rule's level so the eye picks it up as "this section's    */}
      {/* number" rather than a footnote. */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          {kicker && (
            <div className="text-[10px] uppercase tracking-[0.18em] text-paddock-coral font-semibold mb-1.5">
              {kicker}
            </div>
          )}
          <h2
            className={cn(
              "font-display font-bold italic text-f1-white leading-[0.95] tracking-tight",
              TITLE_SIZES[size],
            )}
          >
            {title}
          </h2>
        </div>
        {index != null && (
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paddock-cream/85 self-end pb-1.5 whitespace-nowrap">
            {index}
          </div>
        )}
      </div>

      {/* The rule — 2px cream, full-width, the load-bearing decorative
          element. The mt-3 sits the rule below the descender of the
          italic title without crowding. */}
      <div className="h-[2px] bg-paddock-cream/75 mt-3" />

      {description && (
        <p className="mt-3 text-xs md:text-sm text-f1-muted leading-relaxed max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}

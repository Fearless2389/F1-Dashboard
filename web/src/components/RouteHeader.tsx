import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  /** Required route title — italic Playfair display, large. */
  title: ReactNode;
  /** One-line plain-English subtitle. The "what is this page" answer. */
  subtitle?: ReactNode;
  /**
   * Optional eyebrow kicker — uppercase, tracked-wide, coral. Use for
   * "PREDICT", "REPLAY", "ANALYSE" — the route's role in the IA.
   */
  kicker?: ReactNode;
  /**
   * Optional right-aligned slot. Usually the route's primary controls
   * (season dropdown, round picker, "How this works" trigger, etc.).
   */
  controls?: ReactNode;
  /** Title size. Routes default to "md"; LandingRoute uses "lg". */
  size?: "md" | "lg";
  className?: string;
}

/**
 * Standard header strip for every top-level route. Enforces the same
 * title typography, subtitle voice, and controls alignment across pages
 * so users don't have to re-orient themselves between Watch / Predict /
 * Standings / Schedule / Drivers / About.
 *
 * Previously each route hand-rolled its own `<h1 className="font-display
 * font-bold text-2xl">…</h1>` with whatever subtitle voice felt right
 * that day, which made the IA feel like a stitched collection rather
 * than one product.
 */
export function RouteHeader({
  title, subtitle, kicker, controls, size = "md", className,
}: Props) {
  const titleClass = size === "lg"
    ? "font-display font-black italic text-4xl md:text-5xl tracking-tight leading-[0.95]"
    : "font-display font-bold text-2xl md:text-3xl tracking-tight leading-tight";

  return (
    <header className={cn("flex items-end justify-between gap-3 flex-wrap", className)}>
      <div className="min-w-0">
        {kicker && (
          <div className="text-[10px] uppercase tracking-widest text-paddock-coral font-semibold mb-1">
            {kicker}
          </div>
        )}
        <h1 className={cn(titleClass, "text-f1-white")}>{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-xs md:text-sm text-f1-muted max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {controls && (
        <div className="flex items-center gap-2 flex-wrap">{controls}</div>
      )}
    </header>
  );
}

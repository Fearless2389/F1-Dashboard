import { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Elevation = "recessed" | "panel" | "elevated";

interface CardProps extends ComponentProps<"div"> {
  /**
   * Surface depth.
   *   - `recessed` reads as inset — use for table rows, pressed states.
   *   - `panel`    is the default card surface.
   *   - `elevated` is for hovered cards, dropdowns, modals.
   *
   * Defaults to `panel`. The token layer in tokens.css guarantees
   * borders and shadows are paired with the right background.
   */
  elevation?: Elevation;
}

const ELEVATION_CLASSES: Record<Elevation, string> = {
  recessed:
    "border bg-[var(--surface-recessed)] border-[var(--border-recessed)] shadow-[var(--shadow-recessed)]",
  panel:
    "border bg-[var(--surface-panel)] border-[var(--border-panel)] shadow-[var(--shadow-panel)] backdrop-blur",
  elevated:
    "border bg-[var(--surface-elevated)] border-[var(--border-elevated)] shadow-[var(--shadow-elevated)] backdrop-blur",
};

// Subtle hover lift — translateY(-2px) + slightly deeper shadow. Pure
// CSS so it costs zero JS. Only applied to panel-elevation cards; the
// recessed variant intentionally stays inert (it represents a pressed
// state). Skip on elevated cards because they're often modals/drop-
// downs that have their own enter/exit animation.
const HOVER_LIFT =
  "transition-[transform,box-shadow] duration-200 ease-out " +
  "hover:-translate-y-[2px] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_18px_42px_-14px_rgba(0,0,0,0.7)]";

export function Card({ className, children, elevation = "panel", ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-[var(--radius-lg)]",
        ELEVATION_CLASSES[elevation],
        elevation === "panel" && HOVER_LIFT,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 pt-5 pb-3", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-base font-semibold tracking-tight text-f1-white", className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-1 text-xs text-f1-muted", className)}>{children}</p>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

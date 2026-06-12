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

export function Card({ className, children, elevation = "panel", ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn("rounded-[var(--radius-lg)]", ELEVATION_CLASSES[elevation], className)}
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

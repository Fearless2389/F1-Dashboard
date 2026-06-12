import { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "row" | "card" | "hero";

interface SkeletonProps extends ComponentProps<"div"> {
  /**
   * Named shape so callers don't have to remember Tailwind heights.
   *   - `default` matches the original ad-hoc usage (custom className).
   *   - `row`     for table rows (h-8).
   *   - `card`    for square-ish placeholders (h-44, matches DriverCard).
   *   - `hero`    for hero strips (h-72).
   * Pass a `className` for further tweaks (e.g. width); the variant
   * only locks the height.
   */
  variant?: Variant;
}

const VARIANT_HEIGHT: Record<Variant, string> = {
  default: "",
  row:     "h-8",
  card:    "h-44",
  hero:    "h-72",
};

/**
 * Loading placeholder with a horizontal shimmer sweep. The animation is
 * defined in tokens.css; here we just wire the gradient background and
 * the keyframe.
 *
 * The sheen sweeps left-to-right over a slightly-lighter background tile
 * so the affordance reads "data on the way" without looking like a
 * broken element.
 */
export function Skeleton({ className, variant = "default", style, ...rest }: SkeletonProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-md bg-white/5 overflow-hidden relative",
        VARIANT_HEIGHT[variant],
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 100%)",
        backgroundSize: "200% 100%",
        animation: "paddock-shimmer 1.6s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

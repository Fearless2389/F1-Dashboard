import { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentProps<"span"> {
  color?: string;
  tone?: "default" | "live" | "muted";
}

export function Badge({ color, tone = "default", className, style, children, ...rest }: Props) {
  const toneClass =
    tone === "live"
      ? "bg-f1-red/15 text-f1-red border-f1-red/30"
      : tone === "muted"
        ? "bg-white/5 text-f1-muted border-white/10"
        : "bg-white/5 text-f1-white border-white/10";
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium",
        toneClass,
        className,
      )}
      style={color ? { borderColor: `${color}55`, color, ...style } : style}
    >
      {children}
    </span>
  );
}

import { ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:   "bg-f1-red text-white hover:bg-[#c00500] active:scale-[0.98]",
  secondary: "bg-f1-edge text-f1-white hover:bg-[#2c2c4a] border border-f1-edge",
  ghost:     "bg-transparent text-f1-white hover:bg-white/5",
  danger:    "bg-red-600 text-white hover:bg-red-700",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", ...rest }, ref) => (
    <button type="button"
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-wide",
        "transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red/50",
        variants[variant],
        sizes[size],
        className,
      )}
    />
  ),
);
Button.displayName = "Button";

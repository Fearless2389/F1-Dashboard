import { ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={cn(
        "h-10 w-full rounded-md border border-f1-edge bg-f1-panel px-3 text-sm text-f1-white",
        "placeholder:text-f1-muted focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-f1-red/50 focus-visible:border-f1-red/40",
        className,
      )}
    />
  ),
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(
  ({ className, ...rest }, ref) => (
    <select
      ref={ref}
      {...rest}
      className={cn(
        "h-10 w-full rounded-md border border-f1-edge bg-f1-panel px-3 text-sm text-f1-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red/50",
        className,
      )}
    />
  ),
);
Select.displayName = "Select";

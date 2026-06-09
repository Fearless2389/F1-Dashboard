import { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cn(
        "animate-pulse rounded-md bg-white/5",
        className,
      )}
    />
  );
}

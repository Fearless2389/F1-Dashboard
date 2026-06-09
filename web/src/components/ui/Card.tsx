import { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-xl border border-f1-edge bg-f1-panel/80 backdrop-blur",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_30px_-12px_rgba(0,0,0,0.6)]",
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

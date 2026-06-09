import { ReactNode, createContext, useContext, useState } from "react";
import { cn } from "@/lib/cn";

interface Ctx {
  value: string;
  setValue: (v: string) => void;
}
const TabsCtx = createContext<Ctx | null>(null);

interface TabsProps {
  value?: string;
  defaultValue: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}
export function Tabs({ value, defaultValue, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const v = value ?? internal;
  return (
    <TabsCtx.Provider
      value={{
        value: v,
        setValue: (next) => {
          setInternal(next);
          onValueChange?.(next);
        },
      }}
    >
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-f1-edge bg-f1-panel p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const ctx = useContext(TabsCtx);
  if (!ctx) return null;
  const active = ctx.value === value;
  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium tracking-wide transition-colors",
        active
          ? "bg-f1-red/15 text-f1-red"
          : "text-f1-muted hover:text-f1-white hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsCtx);
  if (!ctx || ctx.value !== value) return null;
  return <div className={cn("mt-4", className)}>{children}</div>;
}

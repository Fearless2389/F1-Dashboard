import { BarChart3, Gauge, Sparkles } from "lucide-react";

import type { ReasoningBlockOut } from "@/lib/types";

interface Props {
  blocks: ReasoningBlockOut[];
}

const IMPACT_STYLES: Record<string, { color: string; bg: string }> = {
  HIGH:   { color: "var(--color-paddock-cyan)",  bg: "rgba(34,232,201,0.16)" },
  MEDIUM: { color: "var(--color-paddock-cyan)",  bg: "rgba(34,232,201,0.10)" },
  LOW:    { color: "#5d8c84",                    bg: "rgba(34,232,201,0.06)" },
};

const SECTION_ICONS = [BarChart3, Gauge, Sparkles] as const;

export function ModelReasoning({ blocks }: Props) {
  return (
    <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={14} className="text-paddock-coral" />
        <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          Model Reasoning
        </span>
      </div>

      {blocks.length === 0 && (
        <div className="text-xs text-f1-muted">No SHAP signals available.</div>
      )}

      <div className="space-y-5">
        {blocks.map((b, i) => {
          const Icon = SECTION_ICONS[i % SECTION_ICONS.length];
          const style = IMPACT_STYLES[b.impact] ?? IMPACT_STYLES.LOW;
          return (
            <div key={i}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-semibold text-f1-white">
                  <Icon size={12} className="text-f1-muted" />
                  {b.label}
                </div>
                <span
                  className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                  style={{ color: style.color, background: style.bg }}
                >
                  {b.impact} Impact
                </span>
              </div>
              <p className="text-xs text-f1-muted leading-relaxed">{b.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

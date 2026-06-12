import { BarChart3, Gauge, Sparkles } from "lucide-react";

import { teamColor } from "@/lib/teams";
import { GlossaryTerm } from "@/lib/glossary";
import type { PodiumReasoning, ReasoningBlockOut } from "@/lib/types";

interface Props {
  /** SHAP-templated reasoning blocks for the predicted P1, P2 and P3 drivers. */
  groups: PodiumReasoning[];
}

const IMPACT_STYLES: Record<string, { color: string; bg: string }> = {
  HIGH:   { color: "var(--color-paddock-cyan)",  bg: "rgba(34,232,201,0.16)" },
  MEDIUM: { color: "var(--color-paddock-cyan)",  bg: "rgba(34,232,201,0.10)" },
  LOW:    { color: "#5d8c84",                    bg: "rgba(34,232,201,0.06)" },
};

const SECTION_ICONS = [BarChart3, Gauge, Sparkles] as const;

/**
 * Model reasoning panel — one stacked section per predicted podium driver.
 * Each section is a SHAP-derived "why this driver" explanation, surfacing
 * the three most influential features behind the model's pick for that
 * slot. P1 first, then P2, then P3.
 */
export function ModelReasoning({ groups }: Props) {
  const safeGroups = groups ?? [];
  return (
    <div className="rounded-xl border border-f1-edge bg-paddock-panel/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={14} className="text-paddock-coral" />
        <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          Model Reasoning · <GlossaryTerm term="podium">Podium</GlossaryTerm>
        </span>
      </div>

      {safeGroups.length === 0 && (
        <div className="text-xs text-f1-muted">
          No <GlossaryTerm term="shap">SHAP</GlossaryTerm> signals available.
        </div>
      )}

      <div className="space-y-6">
        {safeGroups.map(group => (
          <PodiumGroup key={group.position} group={group} />
        ))}
      </div>
    </div>
  );
}

function PodiumGroup({ group }: { group: PodiumReasoning }) {
  const stripe = group.team_colour ?? teamColor(group.team_name);
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: stripe }}>
      <div className="flex items-center gap-2 mb-3">
        <span
          className="font-mono font-bold text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-md"
          style={{ background: `${stripe}22`, color: stripe }}
        >
          P{group.position} · {group.driver_code}
        </span>
        {group.team_name && (
          <span className="text-[10px] text-f1-muted uppercase tracking-widest">
            {group.team_name}
          </span>
        )}
      </div>

      {group.blocks.length === 0 ? (
        <div className="text-[11px] text-f1-muted italic">No reasoning signals.</div>
      ) : (
        <div className="space-y-3">
          {group.blocks.map((b: ReasoningBlockOut, i: number) => {
            const Icon = SECTION_ICONS[i % SECTION_ICONS.length];
            const style = IMPACT_STYLES[b.impact] ?? IMPACT_STYLES.LOW;
            return (
              <div key={`${group.driver_code}-${b.feature}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-f1-white">
                    <Icon size={11} className="text-f1-muted" />
                    {b.label}
                  </div>
                  <span
                    className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                    style={{ color: style.color, background: style.bg }}
                  >
                    {b.impact}
                  </span>
                </div>
                <p className="text-[11px] text-f1-muted leading-relaxed">{b.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

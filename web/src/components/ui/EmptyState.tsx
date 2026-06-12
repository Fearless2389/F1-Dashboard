import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  /**
   * Optional lucide icon node (e.g. `<Clock size={20} />`). Renders in
   * a muted-cream tint above the headline. Omit for text-only empty states.
   */
  icon?: ReactNode;
  /** Required headline — what's missing, in plain English. */
  title: string;
  /** Optional second-line context. Don't restate the title; add detail. */
  description?: ReactNode;
  /** Optional CTA — usually a Button or a Link. Rendered right-aligned below the description. */
  action?: ReactNode;
  /**
   * Visual tone.
   *   - `dashed` (default) — dashed muted border, used when the surface
   *     would otherwise be entirely blank.
   *   - `solid`           — solid panel border, used when EmptyState
   *     replaces a known card slot and we want it to look like content.
   */
  tone?: "dashed" | "solid";
  className?: string;
}

/**
 * Centralised primitive for "nothing here yet" states. Replaces the
 * scattered `<div className="rounded-md border border-dashed border-f1-edge p-6 text-center text-sm text-f1-muted">…</div>`
 * call sites that drifted out of sync — different padding, different
 * borders, sometimes a CTA, sometimes a one-line apology.
 *
 * Three rules a good empty state follows:
 *   1. Say what's missing in plain English — "Race results aren't
 *      published yet" beats "No data."
 *   2. Tell the user when to come back, OR what to do about it.
 *   3. Match the surface it's replacing in width — never let an empty
 *      state collapse a layout grid.
 */
export function EmptyState({
  icon, title, description, action, tone = "dashed", className,
}: Props) {
  const borderClass = tone === "dashed"
    ? "border border-dashed border-f1-edge"
    : "border border-f1-edge";
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-paddock-panel/40 px-6 py-8",
        "flex flex-col items-center justify-center text-center gap-2",
        borderClass,
        className,
      )}
    >
      {icon && (
        <div className="text-paddock-cream/70 mb-1" aria-hidden>
          {icon}
        </div>
      )}
      <div className="text-sm font-semibold text-f1-white">{title}</div>
      {description && (
        <div className="text-xs text-f1-muted leading-relaxed max-w-md">
          {description}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

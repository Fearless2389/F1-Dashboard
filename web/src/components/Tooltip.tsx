import { ReactNode, useId, useState } from "react";
import { cn } from "@/lib/cn";

interface Props {
  /** What renders inside the tooltip when shown. */
  content: ReactNode;
  /** Position relative to the trigger. Defaults to "top". */
  side?: "top" | "bottom";
  /** Optional className applied to the trigger wrapper. */
  className?: string;
  children: ReactNode;
}

/**
 * Hand-rolled hover/focus tooltip primitive — no extra dep, no portal.
 *
 * Reasons over radix-ui/Tooltip:
 *   1. We only need a single tooltip at a time and don't need collision
 *      detection sophisticated enough to justify the dep weight.
 *   2. The dotted-underline glossary terms are inline in flowing text, so
 *      tooltips that float in absolute coordinates relative to the
 *      trigger (rather than escaping into a portal) feel snappier and
 *      don't fight the page's z-index stack.
 *   3. Accessibility is met with `aria-describedby` + focus/blur on the
 *      trigger so keyboard users get the same affordance as mouse users.
 *
 * Trade-off: the tooltip can be clipped by nearby overflow-hidden
 * containers. For glossary terms in body text that's fine — the tooltip
 * never travels more than ~24 px in any direction.
 */
export function Tooltip({ content, side = "top", className, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-50 w-max max-w-[280px]",
            "rounded-md border border-f1-edge bg-f1-dark/95 backdrop-blur shadow-2xl",
            "px-3 py-2 text-[11px] text-f1-white leading-relaxed font-normal normal-case tracking-normal",
            "pointer-events-none",
            side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

import { ReactNode, useState } from "react";
import { Info, X } from "lucide-react";

interface Props {
  /** Stable key — used to persist "dismissed" state across reloads. */
  storageKey: string;
  /** Headline text (no emoji needed; the icon is rendered separately). */
  title: string;
  /** The actual primer — 1-3 sentences in plain English. */
  children: ReactNode;
}

/**
 * Dismissable "New to F1?" primer strip.
 *
 * Rendered above the main content on /apex and /standings — the two
 * surfaces a newcomer is likeliest to land on from the navigation.
 * Stores its dismissed state in localStorage keyed by `storageKey` so
 * the strip stays away once the visitor has read it, but returns for
 * fresh viewers.
 *
 * Style: subtle coral tint (the brand colour) without the loud
 * paddock-glow animation — present enough to read, calm enough that a
 * returning visitor doesn't feel nagged.
 */
export function NewToF1Strip({ storageKey, title, children }: Props) {
  const fullKey = `paddock.dismissed.${storageKey}`;

  // Initialise from localStorage on first render so the strip doesn't
  // briefly flash before useEffect can hide it.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(fullKey) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(fullKey, "1");
    } catch {
      // Storage may be unavailable in incognito or with restrictive
      // policies; that's fine — the strip just reappears next visit.
    }
  };

  return (
    <div
      className="relative rounded-lg border border-paddock-coral/30 bg-paddock-coral/5 px-4 py-3 flex items-start gap-3"
      role="note"
    >
      <Info size={16} className="text-paddock-coral shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0 text-sm leading-relaxed">
        <div className="font-semibold text-f1-white text-xs uppercase tracking-widest mb-1">
          {title}
        </div>
        <div className="text-f1-muted">{children}</div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-f1-muted hover:text-f1-white p-1 -m-1 rounded-md"
        aria-label="Dismiss this notice"
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

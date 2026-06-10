import { m, AnimatePresence } from "framer-motion";
import { AlertTriangle, OctagonAlert, ShieldAlert } from "lucide-react";

type Status = "AllClear" | "Yellow" | "SC" | "VSC" | "Red";

interface Props {
  status?: string | null;
}

interface BannerSpec {
  label: string;
  Icon: typeof AlertTriangle;
  bg: string;
  text: string;
  border: string;
  flash?: boolean;
}

const SPECS: Record<Status, BannerSpec | null> = {
  AllClear: null,
  Yellow: {
    label: "Yellow Flag",
    Icon: AlertTriangle,
    bg: "rgba(255, 210, 0, 0.18)",
    text: "#ffd200",
    border: "rgba(255, 210, 0, 0.6)",
  },
  VSC: {
    label: "Virtual Safety Car",
    Icon: ShieldAlert,
    bg: "rgba(255, 210, 0, 0.20)",
    text: "#ffd200",
    border: "rgba(255, 210, 0, 0.7)",
  },
  SC: {
    label: "Safety Car Deployed",
    Icon: ShieldAlert,
    bg: "rgba(255, 128, 0, 0.22)",
    text: "#ff8000",
    border: "rgba(255, 128, 0, 0.7)",
  },
  Red: {
    label: "Red Flag · Session Suspended",
    Icon: OctagonAlert,
    bg: "rgba(225, 6, 0, 0.28)",
    text: "#ff3a36",
    border: "rgba(225, 6, 0, 0.85)",
    flash: true,
  },
};

export function TrackStatusBanner({ status }: Props) {
  const spec = status && (SPECS as any)[status] ? SPECS[status as Status] : null;
  return (
    <AnimatePresence>
      {spec && (
        <m.div
          key={spec.label}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 30 }}
          className="pointer-events-none flex items-center gap-2.5 rounded-lg backdrop-blur px-4 py-2 border shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)]"
          style={{ background: spec.bg, color: spec.text, borderColor: spec.border }}
        >
          <m.span
            animate={spec.flash ? { opacity: [1, 0.4, 1] } : undefined}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex"
          >
            <spec.Icon size={16} />
          </m.span>
          <span className="font-display font-semibold text-sm uppercase tracking-wider">
            {spec.label}
          </span>
        </m.div>
      )}
    </AnimatePresence>
  );
}

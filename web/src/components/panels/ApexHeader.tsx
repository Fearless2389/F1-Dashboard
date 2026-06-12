import { useEffect, useState } from "react";

interface Props {
  modelVersion: string;
  nextEvent: string;
  trainDate?: string | null;
}

/**
 * Top strip of the Apex page — model version + huge title + next event +
 * "last updated" ticker that counts seconds since the last train_date.
 */
export function ApexHeader({ modelVersion, nextEvent, trainDate }: Props) {
  const [elapsed, setElapsed] = useState<string>("—");

  useEffect(() => {
    if (!trainDate) {
      setElapsed("—");
      return;
    }
    const trained = new Date(trainDate).getTime();
    if (!isFinite(trained)) {
      setElapsed("—");
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - trained) / 1000));
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [trainDate]);

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
        MODEL {modelVersion} · ACTIVE
      </div>
      <div className="flex items-end justify-between gap-4 mt-1 flex-wrap">
        <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight leading-none text-f1-white">
          APEX PREDICTOR
        </h1>
        <div className="flex items-end gap-8">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-f1-muted">Next Event</div>
            <div className="font-display font-bold text-sm md:text-base text-paddock-cream mt-1">
              {nextEvent}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-f1-muted">Last Updated</div>
            <div className="font-display font-bold text-base text-paddock-coral mt-1 tabular-nums">
              {elapsed}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

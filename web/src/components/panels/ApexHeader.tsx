interface Props {
  modelVersion: string;
  nextEvent: string;
}

/**
 * Top strip of the Apex page — model version + huge title + next event.
 *
 * The "Last Updated" elapsed ticker was removed at the user's request —
 * it added a second auto-ticking clock to a page that already has the
 * split-flap countdown in the schedule's NextRaceHero, and the value
 * (seconds since model train) wasn't load-bearing for any reader.
 */
export function ApexHeader({ modelVersion, nextEvent }: Props) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
        MODEL {modelVersion} · ACTIVE
      </div>
      <div className="flex items-end justify-between gap-4 mt-1 flex-wrap">
        <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight leading-none text-f1-white">
          APEX PREDICTOR
        </h1>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-f1-muted">Next Event</div>
          <div className="font-display font-bold text-sm md:text-base text-paddock-cream mt-1">
            {nextEvent}
          </div>
        </div>
      </div>
    </div>
  );
}

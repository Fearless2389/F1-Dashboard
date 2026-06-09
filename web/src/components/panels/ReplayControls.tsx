import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { Speed } from "@/hooks/useReplay";

interface Props {
  lap: number;
  nLaps: number;
  isPlaying: boolean;
  speed: Speed;
  onTogglePlay: () => void;
  onStep: (delta: number) => void;
  onSeek: (lap: number) => void;
  onSpeed: (s: Speed) => void;
}

export function ReplayControls({
  lap, nLaps, isPlaying, speed,
  onTogglePlay, onStep, onSeek, onSpeed,
}: Props) {
  const speeds: Speed[] = [2, 4, 8, 16, 32];

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onStep(-1)} aria-label="Step back">
              <SkipBack size={14} />
            </Button>
            <Button variant="primary" size="sm" onClick={onTogglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onStep(1)} aria-label="Step forward">
              <SkipForward size={14} />
            </Button>
          </div>

          <div className="flex items-center gap-2 ml-2">
            <span className="text-[10px] uppercase tracking-widest text-f1-muted">Speed</span>
            {speeds.map(s => (
              <button
                key={s}
                onClick={() => onSpeed(s)}
                className={cn(
                  "rounded-md border border-f1-edge px-2 py-1 text-xs font-mono",
                  s === speed
                    ? "border-f1-red text-f1-red bg-f1-red/10"
                    : "text-f1-muted hover:text-f1-white",
                )}
              >
                {s}×
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[200px] flex items-center gap-3">
            <Badge tone="muted" className="font-mono">
              Lap {lap} / {nLaps}
            </Badge>
            <input
              type="range"
              min={1}
              max={nLaps}
              value={lap}
              onChange={(e) => onSeek(parseInt(e.target.value, 10))}
              className="flex-1 accent-f1-red"
              aria-label="Lap scrubber"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { LiveSnapshot, ReplayDriver } from "@/lib/types";

export type Speed = 2 | 4 | 8 | 16 | 32;

interface ReplayMeta {
  season: number;
  round: number;
  race_name: string;
  circuit_id?: string | null;
  n_laps: number;
  n_drivers: number;
  podium: { position: number; driver_code: string; team_name: string }[];
}

interface TrajectorySamples {
  t:   number[];
  p:   number[];
  pos: number[];
  gap: (number | null)[];
  int: (number | null)[];
}

interface TrajectoryCompoundChange {
  lap: number;
  compound: string | null;
  stint: number | null;
}

interface TrajectoryPitWindow {
  lap: number;
  in_t: number;
  out_t: number;
}

interface TrajectoryLapTime {
  lap: number;
  t: number;
  compound: string | null;
}

interface TrajectoryDriver {
  code: string;
  number: number | null;
  team_name: string;
  team_colour: string | null;
  samples: TrajectorySamples;
  compound_changes: TrajectoryCompoundChange[];
  pit_laps: number[];
  pit_windows: TrajectoryPitWindow[];
  lap_times: TrajectoryLapTime[];
  final_lap: number;
}

interface DrsZone {
  start: number;   // lap-progress 0..1
  end: number;
}

interface TrajectoryResponse {
  season: number;
  round: number;
  race_name: string;
  circuit_id: string | null;
  n_laps: number;
  session_duration_s: number;
  race_start_t: number;
  race_end_t: number;
  drivers: TrajectoryDriver[];
  lap_marks: number[];
  track_status_changes: { t: number; status: string }[];
  overtakes: any[];
  drs_zones: DrsZone[];
  sector_marks: number[];
}

interface SafetyCar {
  /** lap_progress 0..1 — where to render the SC dot on the track path */
  lapProgress: number;
  /** Deploying = first 2s after SC status begins, fade-in.
   *  OnTrack   = steady amber glow.
   *  Returning = last 2s before SC ends, fade-out. */
  phase: "deploying" | "on_track" | "returning";
}

interface UseReplayReturn {
  meta: ReplayMeta | undefined;
  snapshot: LiveSnapshot | null;
  lap: number;
  setLap: (lap: number) => void;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: (delta: number) => void;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  loading: boolean;
  error: string | null;
  /** Current session time in seconds (for components that want it raw) */
  sessionTime: number;
  /** Race-progress for the leader (0..n_laps) — drives the top progress bar */
  raceProgress: number;
  /** Non-null whenever the Safety Car is on track — drives the SC dot. */
  safetyCar: SafetyCar | null;
  /** Per-driver lookup of (lap_times, pit_laps) — feeds the telemetry panel. */
  getDriverHistory: (code: string) => { lap_times: TrajectoryLapTime[]; pit_laps: number[] } | null;
  /** DRS-zone segments (lap_progress 0..1). Empty when telemetry not cached. */
  drsZones: DrsZone[];
  /** Lap-progress 0..1 where sector 1 and sector 2 end. (S3 ends at 1.0.) */
  sectorMarks: number[];
}

/**
 * Binary search: returns the index `i` such that `arr[i-1] <= x < arr[i]`.
 * If x is below arr[0] returns 0; if x is above arr[last] returns arr.length.
 */
function bisect(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function fmtGap(secs: number | null | undefined): string | null {
  if (secs == null || !isFinite(secs)) return null;
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs - m * 60;
    return `+${m}:${s.toFixed(3).padStart(6, "0")}`;
  }
  return `+${secs.toFixed(3)}`;
}

/**
 * Replay playback state machine — version 2.
 *
 * Differences from v1:
 *   • Backend serves a single `trajectory` payload (all drivers, full race).
 *   • Playhead is *session-time*, advanced by `requestAnimationFrame` at the
 *     user's playback speed → dots move continuously, not lap-by-lap.
 *   • Per-driver position / progress / gap is linearly interpolated between
 *     trajectory samples at the current session-time.
 *   • Output is still the LiveSnapshot shape — TimingTower / ReplayTrackMap
 *     consume it without changes.
 */
export function useReplay(season: number, roundNum: number): UseReplayReturn {
  const [isPlaying, setPlaying] = useState(false);
  // Speed semantics: 1× = ACTUAL real-time (one session-second per real-second).
  // 8× compresses a 90 s lap to ~11 s, which is the broadcast-replay sweet spot
  // for skimming a race.
  const [speed, setSpeed] = useState<Speed>(8);
  const [sessionTime, setSessionTime] = useState(0);

  const metaQ = useQuery({
    queryKey: ["replay", "meta", season, roundNum],
    queryFn: () => api.get<ReplayMeta>(`/api/replay/${season}/${roundNum}`),
    enabled: !!(season && roundNum),
    staleTime: Infinity,
  });

  const trajQ = useQuery({
    queryKey: ["replay", "trajectory", season, roundNum],
    queryFn: () =>
      api.get<TrajectoryResponse>(`/api/replay/${season}/${roundNum}/trajectory`),
    enabled: !!(season && roundNum),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
  });

  const traj = trajQ.data;
  const meta = metaQ.data;

  // Race playback window — drops the long pre-race wait (formation laps, red
  // flags, etc.) so the user lands at the actual race start.
  const raceStart = traj?.race_start_t ?? 0;
  const raceEnd = traj?.race_end_t ?? traj?.session_duration_s ?? 0;

  // Average lap duration — only used downstream for things like the seek
  // fallback. Playback speed itself is now in real-time units.
  const avgLapDuration = useMemo(() => {
    if (!traj || traj.n_laps <= 0) return 90;
    const winLen = Math.max(60, raceEnd - raceStart);
    return winLen / Math.max(1, traj.n_laps);
  }, [traj, raceStart, raceEnd]);

  // When the trajectory first loads (or the race changes), seek the playhead
  // to the race start so the user doesn't stare at empty pre-race laps.
  useEffect(() => {
    setPlaying(false);
    if (traj) setSessionTime(traj.race_start_t);
  }, [traj, season, roundNum]);

  // rAF playback loop — kept in a ref so dependency churn doesn't restart it
  const stateRef = useRef({ isPlaying, speed, raceEnd });
  stateRef.current = { isPlaying, speed, raceEnd };

  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastT) / 1000); // cap dt so a stalled tab doesn't jump
      lastT = now;
      const s = stateRef.current;
      if (s.isPlaying && s.raceEnd > 0) {
        // 1× = REAL-TIME. dt is seconds since last frame, so adding
        // `speed * dt` to sessionTime makes 1× play back at the actual race
        // pace. 8× compresses ~90s laps to ~11s — a watchable skim.
        const stStep = s.speed * dt;
        setSessionTime(prev => {
          const next = prev + stStep;
          if (next >= s.raceEnd) {
            setPlaying(false);
            return s.raceEnd;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // mount once

  // Derive lap number from session time via lap_marks (binary search)
  const currentLap = useMemo(() => {
    if (!traj || traj.lap_marks.length === 0) return 1;
    const idx = bisect(traj.lap_marks, sessionTime);
    return Math.max(1, Math.min(traj.n_laps, idx + 1));
  }, [traj, sessionTime]);

  // Build the snapshot at the current session time
  const snapshot = useMemo<LiveSnapshot | null>(() => {
    if (!traj) return null;

    const drivers: ReplayDriver[] = traj.drivers.map(d => {
      const s = d.samples;
      const n = s.t.length;
      let progress = 0;
      let pos = 99;
      let gap: number | null = null;
      let interval: number | null = null;

      if (n === 0) {
        // No samples at all — render at start
        progress = 0;
      } else {
        const idx = bisect(s.t, sessionTime);
        if (idx === 0) {
          progress = s.p[0];
          pos = s.pos[0];
          gap = s.gap[0];
          interval = s.int[0];
        } else if (idx >= n) {
          // Past last sample — extrapolate forward at average pace (for the leader
          // who has very sparse samples, this lets the dot keep advancing).
          const t0 = s.t[n - 1];
          const p0 = s.p[n - 1];
          const elapsed = Math.max(0, sessionTime - t0);
          progress = p0 + elapsed / avgLapDuration;
          pos = s.pos[n - 1];
          gap = s.gap[n - 1];
          interval = s.int[n - 1];
        } else {
          const t0 = s.t[idx - 1];
          const t1 = s.t[idx];
          const frac = t1 === t0 ? 0 : (sessionTime - t0) / (t1 - t0);
          progress = s.p[idx - 1] + (s.p[idx] - s.p[idx - 1]) * frac;
          pos = s.pos[idx - 1];   // step-wise — position only changes on rank events
          const g0 = s.gap[idx - 1];
          const g1 = s.gap[idx];
          gap = g0 != null && g1 != null
            ? g0 + (g1 - g0) * frac
            : (g1 ?? g0);
          const i0 = s.int[idx - 1];
          const i1 = s.int[idx];
          interval = i0 != null && i1 != null
            ? i0 + (i1 - i0) * frac
            : (i1 ?? i0);
        }
      }

      // Lap & lap progress (modulo race progress; clamp to <1.0)
      const lapNum = Math.max(1, Math.floor(progress) + 1);
      const lapProgress = Math.max(0, Math.min(0.999, progress - Math.floor(progress)));

      // Compound + stint + tyre_age at this lap — last change before or at
      // this lap. tyre_life = current lap minus the lap the current stint
      // started on (so a fresh set reads as 1, not 0).
      let compound: string | null = null;
      let stint: number | null = null;
      let stintStartLap = 1;
      for (const c of d.compound_changes) {
        if (c.lap <= lapNum) {
          compound = c.compound;
          stint = c.stint;
          stintStartLap = c.lap;
        } else break;
      }
      const tyreLife = compound ? Math.max(1, lapNum - stintStartLap + 1) : null;

      // Pit count = pits completed by current lap
      const pitCount = d.pit_laps.filter(l => l <= lapNum).length;

      // Is the driver currently in a pit window at this session time?
      // Defensive default — an older uvicorn (pre-Phase 17 batch) that hasn't
      // been restarted yet won't include `pit_windows` in the payload.
      const pitWindows = d.pit_windows ?? [];
      const isPitting = pitWindows.some(w => sessionTime >= w.in_t && sessionTime <= w.out_t);

      // Has the driver finished/retired before this point?
      const retired = d.final_lap > 0 && lapNum > d.final_lap;

      return {
        driver_number:  d.number,
        driver_code:    d.code,
        full_name:      d.code,
        team_name:      d.team_name || "",
        team_colour:    d.team_colour,
        headshot_url:   null,
        position:       retired ? null : pos,
        gap_to_leader:  pos === 1 ? "LEADER" : fmtGap(gap),
        interval:       pos === 1 ? null : fmtGap(interval),
        compound:       compound,
        stint_number:   stint,
        lap_start:      lapNum,
        pit_count:      pitCount,
        lap_progress:   lapProgress,
        tyre_life:      tyreLife,
        lap_time:       null,
        top_speed:      null,
        // Replay-only extensions surfaced to consumers via the snapshot.
        // `retired` hides the dot from the track map; `is_pitting` dims it.
        retired,
        is_pitting:     isPitting,
      } as ReplayDriver;
    });

    // Sort by interpolated position (cars actively in the field first; retirees last)
    drivers.sort((a, b) => {
      const ap = a.position ?? 99;
      const bp = b.position ?? 99;
      return ap - bp;
    });

    // Track status at current session time — pick the most-recent change
    let trackStatus = "AllClear";
    for (const c of traj.track_status_changes) {
      if (c.t <= sessionTime) trackStatus = c.status;
      else break;
    }

    return {
      session_key:        null,
      session_name:       "Race",
      session_type:       "Race",
      circuit_short_name: traj.circuit_id,
      country_name:       null,
      year:               traj.season,
      status:             "Replay",
      fetched_at:         new Date().toISOString(),
      track_status:       trackStatus,
      drivers:            drivers as any,
      race_control:       [],
      weather:            {
        air_temperature:   null,
        track_temperature: null,
        humidity:          null,
        wind_speed:        null,
        rainfall:          false,
      },
      replay: {
        season: traj.season,
        round:  traj.round,
        lap:    currentLap,
        n_laps: traj.n_laps,
      },
    } as unknown as LiveSnapshot;
  }, [traj, sessionTime, currentLap, avgLapDuration]);

  // Lap setter — seeks to the START of the requested lap (just after the
  // previous lap's leader-line crossing). For lap 1 we go to race_start_t
  // so the user lands at lights-out, not at the lap-1-completion moment.
  const setLap = useCallback((n: number) => {
    if (!traj) return;
    const target = Math.max(1, Math.min(traj.n_laps, n));
    if (target === 1) {
      setSessionTime(traj.race_start_t);
      return;
    }
    const t = traj.lap_marks[target - 2];
    if (t != null) setSessionTime(t);
    else setSessionTime(traj.race_start_t + ((target - 1) / traj.n_laps) * (traj.race_end_t - traj.race_start_t));
  }, [traj]);

  const step = useCallback((delta: number) => {
    setLap(currentLap + delta);
  }, [setLap, currentLap]);

  // Safety Car overlay — runs ~500 m ahead of the leader during any "SC"
  // period in the track-status timeline. We bracket each SC window so we can
  // fade the dot in (deploying) and out (returning) at the boundaries.
  const safetyCar = useMemo<SafetyCar | null>(() => {
    if (!traj) return null;
    // Find the most recent track-status change at sessionTime
    let activeStart: number | null = null;
    let activeEnd: number | null = null;
    let currentStatus = "AllClear";
    for (let i = 0; i < traj.track_status_changes.length; i++) {
      const c = traj.track_status_changes[i];
      if (c.t > sessionTime) {
        if (currentStatus === "SC" && activeStart != null) activeEnd = c.t;
        break;
      }
      if (c.status === "SC") {
        activeStart = c.t;
      } else if (currentStatus === "SC") {
        activeStart = null;
      }
      currentStatus = c.status;
    }
    if (currentStatus !== "SC" || activeStart == null) return null;
    if (activeEnd == null) activeEnd = traj.race_end_t;

    // Phase: 2s deploy fade-in, 2s return fade-out
    const FADE = 2.0;
    let phase: SafetyCar["phase"] = "on_track";
    if (sessionTime - activeStart < FADE) phase = "deploying";
    else if (activeEnd - sessionTime < FADE) phase = "returning";

    // SC position: leader_progress + ~250m offset on a 5km track = 0.05 lap.
    // Compute leader's progress by picking the driver currently at position 1.
    const leader = traj.drivers.find(d => {
      const s = d.samples;
      const idx = bisect(s.t, sessionTime);
      const i = Math.min(s.pos.length - 1, Math.max(0, idx - 1));
      return s.pos[i] === 1;
    });
    if (!leader) return null;
    const s = leader.samples;
    const idx = bisect(s.t, sessionTime);
    let leaderProgress = 0;
    if (idx === 0) leaderProgress = s.p[0];
    else if (idx >= s.t.length) leaderProgress = s.p[s.t.length - 1];
    else {
      const t0 = s.t[idx - 1], t1 = s.t[idx];
      const frac = t1 === t0 ? 0 : (sessionTime - t0) / (t1 - t0);
      leaderProgress = s.p[idx - 1] + (s.p[idx] - s.p[idx - 1]) * frac;
    }
    const lapProgress = ((leaderProgress + 0.05) % 1 + 1) % 1;
    return { lapProgress, phase };
  }, [traj, sessionTime]);

  // raceProgress in [0, n_laps] — drives the slim top progress bar.
  const raceProgress = useMemo(() => {
    if (!traj || traj.lap_marks.length === 0) return 0;
    const idx = bisect(traj.lap_marks, sessionTime);
    if (idx === 0) return sessionTime / traj.lap_marks[0];
    if (idx >= traj.lap_marks.length) return traj.n_laps;
    const t0 = traj.lap_marks[idx - 1];
    const t1 = traj.lap_marks[idx];
    return idx + (sessionTime - t0) / (t1 - t0);
  }, [traj, sessionTime]);

  return {
    meta,
    snapshot,
    lap:          currentLap,
    setLap,
    isPlaying,
    play:         useCallback(() => setPlaying(true), []),
    pause:        useCallback(() => setPlaying(false), []),
    toggle:       useCallback(() => setPlaying(p => !p), []),
    step,
    speed,
    setSpeed,
    loading:      trajQ.isLoading || metaQ.isLoading,
    error:        (trajQ.error as any)?.message ?? null,
    sessionTime,
    raceProgress,
    safetyCar,
    drsZones: traj?.drs_zones ?? [],
    sectorMarks: traj?.sector_marks ?? [],
    getDriverHistory: useCallback((code: string) => {
      const d = traj?.drivers.find(d => d.code === code);
      if (!d) return null;
      return { lap_times: d.lap_times ?? [], pit_laps: d.pit_laps ?? [] };
    }, [traj]),
  };
}

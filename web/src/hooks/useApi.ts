import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CompareResponse,
  DriverProfile,
  LiveSnapshot,
  ModelManifest,
  PredictionRequest,
  PredictionResponse,
  RaceEvent,
  ScheduleResponse,
} from "@/lib/types";

// Long stale windows for data that effectively doesn't change intra-session.
const HOUR = 60 * 60_000;
const MIN_5 = 5 * 60_000;

// ── Schedule ──────────────────────────────────────────────────────────────────

export function useSchedule(year: number, includeWeather = false) {
  return useQuery({
    queryKey: ["schedule", year, includeWeather],
    queryFn: () => api.get<ScheduleResponse>(
      `/api/schedule/${year}?include_weather=${includeWeather}`,
    ),
    staleTime: HOUR,
  });
}

export function useRound(year: number, round: number) {
  return useQuery({
    queryKey: ["round", year, round],
    queryFn: () => api.get<RaceEvent>(`/api/schedule/${year}/${round}?include_weather=true`),
    enabled: !!(year && round),
    staleTime: HOUR,
  });
}

// ── Live ──────────────────────────────────────────────────────────────────────

export function useLiveSnapshot(enabled = true) {
  return useQuery({
    queryKey: ["live", "snapshot"],
    queryFn: () => api.get<LiveSnapshot>("/api/live/snapshot"),
    refetchInterval: enabled ? 10_000 : false,
    enabled,
    staleTime: 5_000,
  });
}

// ── Historical ────────────────────────────────────────────────────────────────

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: () => api.get<string[]>("/api/drivers"),
    staleTime: HOUR,
  });
}

export function useDriverProfile(code: string | undefined) {
  return useQuery({
    queryKey: ["driver", code],
    queryFn: () => api.get<DriverProfile>(`/api/drivers/${code}`),
    enabled: !!code,
    staleTime: MIN_5,
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<string[]>("/api/teams"),
    staleTime: HOUR,
  });
}

export function useCompare(drivers: string[], from: number, to: number) {
  return useQuery({
    queryKey: ["compare", drivers, from, to],
    queryFn: () => api.get<CompareResponse>(
      `/api/compare?drivers=${drivers.join(",")}&from_season=${from}&to_season=${to}`,
    ),
    enabled: drivers.length >= 1,
    staleTime: MIN_5,
  });
}

// ── Predict ───────────────────────────────────────────────────────────────────

export function usePredictMutation() {
  return useMutation({
    mutationFn: (req: PredictionRequest) =>
      api.post<PredictionResponse>("/api/predict", req),
  });
}

export function useSimulateMutation() {
  return useMutation({
    mutationFn: (req: PredictionRequest & { n_iterations?: number }) =>
      api.post<{
        season: number; round: number; n_iterations: number;
        win_distribution: Record<string, number>;
        podium_distribution: Record<string, number>;
        expected_points: Record<string, number>;
        podium_combinations: { drivers: string[]; probability: number }[];
      }>("/api/predict/simulate", req),
  });
}

// ── Model ─────────────────────────────────────────────────────────────────────

export function useManifest() {
  return useQuery({
    queryKey: ["manifest"],
    queryFn: () => api.get<ModelManifest>("/api/models"),
    staleTime: Infinity,    // manifest only changes on a fresh train
  });
}

export function useImportance(target: string) {
  return useQuery({
    queryKey: ["importance", target],
    queryFn: () => api.get<{
      target: string;
      rows: { feature: string; importance: number }[];
    }>(`/api/models/${target}/importance`),
    staleTime: Infinity,
  });
}

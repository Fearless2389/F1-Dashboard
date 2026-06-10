/**
 * Type re-exports — convenience aliases over the auto-generated
 * `types.gen.ts` so route components can `import { LiveSnapshot } from "@/lib/types"`
 * regardless of how the OpenAPI schema namespaces things.
 *
 * Regenerate the source-of-truth file:
 *     1. uvicorn src.api.main:app --port 8000     (in repo root)
 *     2. cd web && pnpm types:gen                  (or `npm run types:gen`)
 *
 * Do NOT edit `types.gen.ts` directly — regenerate it instead.
 */

import type { components } from "./types.gen";

type S = components["schemas"];

export type WeatherSample        = S["WeatherSample"];
export type LiveDriver           = S["LiveDriver"];
export type RaceControlMessage   = S["RaceControlMessage"];
export type LiveSnapshot         = S["LiveSnapshot"];
export type CircuitMeta          = S["CircuitMeta"];
export type WeatherForecast      = S["WeatherForecast"];
export type RaceEvent            = S["RaceEvent"];
export type ScheduleResponse     = S["ScheduleResponse"];
export type QualiInput           = S["QualiInput"];
export type PredictionRequest    = S["PredictionRequest"];
export type DriverPrediction     = S["DriverPrediction"];
export type PodiumProbability    = S["PodiumProbability"];
export type PredictionResponse   = S["PredictionResponse"];
export type SimulationRequest    = S["SimulationRequest"];
export type SimulationResponse   = S["SimulationResponse"];
export type DriverSeasonRow      = S["DriverSeasonRow"];
export type DriverProfile        = S["DriverProfile"];
export type TeamTrendRow         = S["TeamTrendRow"];
export type CompareResponse      = S["CompareResponse"];
export type TargetMetrics        = S["TargetMetrics"];
export type ModelManifest        = S["ModelManifest"];

// Phase 9 additions
export type DriverCard           = S["DriverCard"];
export type DriverSeasonResult   = S["DriverSeasonResult"];
export type DriverStandingsRow   = S["DriverStandingsRow"];
export type ConstructorStandingsRow = S["ConstructorStandingsRow"];
export type StandingsResponse    = S["StandingsResponse"];
export type LapRecord            = S["LapRecord"];
export type StandingsProgressionResponse = S["StandingsProgressionResponse"];
export type ProgressionRound     = S["ProgressionRound"];
export type ProgressionDriver    = S["ProgressionDriver"];
export type ReplayRaceListEntry  = S["ReplayRaceListEntry"];
export type ReplayMeta           = S["ReplayMeta"];
export type ReplayPodium         = S["ReplayPodium"];
export type WinProbabilityFrame  = S["WinProbabilityFrame"];
export type WinProbabilityResponse = S["WinProbabilityResponse"];
export type WinProbabilityRow    = S["WinProbabilityRow"];

// Phase 9.1 — replay overtakes
export type OvertakeEvent        = S["OvertakeEvent"];
export type OvertakesResponse    = S["OvertakesResponse"];

// Phase 13 — Apex Predictor
export type ApexResponse         = S["ApexResponse"];
export type ApexRaceMeta         = S["ApexRaceMeta"];
export type TopPrediction        = S["TopPrediction"];
export type PodiumSlot           = S["PodiumSlot"];
export type ReasoningBlockOut    = S["ReasoningBlockOut"];
export type PodiumReasoning      = S["PodiumReasoning"];
export type FinishRow            = S["FinishRow"];
export type ReliabilityScore     = S["ReliabilityScore"];
export type LapByLapResponse     = S["LapByLapResponse"];
export type LapByLapFrame        = S["LapByLapFrame"];
export type LapByLapRow          = S["LapByLapRow"];
export type LapByLapDriverMeta   = S["LapByLapDriverMeta"];

// LiveDriver with replay extensions (lap_progress, lap_time, top_speed)
export interface ReplayDriver {
  driver_number: number | null;
  driver_code: string;
  full_name: string;
  team_name: string;
  team_colour: string | null;
  headshot_url: string | null;
  position: number | null;
  gap_to_leader: string | null;
  interval: string | null;
  compound: string | null;
  stint_number: number | null;
  lap_start: number | null;
  pit_count: number;
  lap_progress?: number;
  lap_time?: string | null;
  top_speed?: number | null;
  /** True after this driver retired — track map should hide them. */
  retired?: boolean;
  /** True while inside a pit_in → pit_out window — dim the dot. */
  is_pitting?: boolean;
}

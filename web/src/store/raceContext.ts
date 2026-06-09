import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RaceContextState {
  season: number;
  round: number;
  driverFocus: string | null;
  setSeason: (season: number) => void;
  setRound: (round: number) => void;
  setDriverFocus: (code: string | null) => void;
}

export const useRaceContext = create<RaceContextState>()(
  persist(
    (set) => ({
      season: 2026,
      round: 1,
      driverFocus: null,
      setSeason: (season) => set({ season }),
      setRound: (round) => set({ round }),
      setDriverFocus: (driverFocus) => set({ driverFocus }),
    }),
    { name: "f1ml-context" },
  ),
);

from typing import Optional
from pydantic import BaseModel


class ForecastTopPick(BaseModel):
    driver_code: str
    full_name: Optional[str] = None
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    prob: float                              # 0..1


class ForecastDriver(BaseModel):
    driver_code: str
    full_name: Optional[str] = None
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    expected_position: float                 # conditional-on-finishing mean
    win_prob: float                          # 0..1 — unconditional P(P1)
    podium_prob: float                       # 0..1 — unconditional P(top-3)
    dnf_prob: float                          # 0..1 — share of sims retiring
    position_distribution: list[float]       # length 20 (P1..P20); sums to 1 - dnf_prob


class ForecastRaceMeta(BaseModel):
    season: int
    round: int
    race_name: str
    circuit_id: Optional[str] = None
    event_date: Optional[str] = None


class ForecastResponse(BaseModel):
    race_meta: ForecastRaceMeta
    pole_pick: ForecastTopPick
    winner_pick: ForecastTopPick
    drivers: list[ForecastDriver]            # ordered by expected_position
    n_simulations: int
    generated_at: str                        # ISO timestamp
    quali_source: str                        # "actual" | "predicted"

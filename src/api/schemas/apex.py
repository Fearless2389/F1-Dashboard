from typing import Optional
from pydantic import BaseModel


class TopPrediction(BaseModel):
    driver_code: str
    driver_number: Optional[int] = None
    full_name: Optional[str] = None
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    headshot_url: Optional[str] = None
    win_prob: float
    win_low: Optional[float] = None       # conformal lower bound
    win_high: Optional[float] = None
    stochastic_mean: Optional[float] = None
    description: str


class PodiumSlot(BaseModel):
    position: int                          # 1, 2, 3
    driver_code: str
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    prob: float                            # 0..1 podium probability


class ReasoningBlockOut(BaseModel):
    label: str                             # "TYRE DEGRADATION"
    impact: str                            # HIGH | MEDIUM | LOW
    text: str
    feature: str                           # source feature name (for debug)


class FinishRow(BaseModel):
    position: int                          # 4..10
    driver_code: str
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    est_gap_s: float                       # seconds to leader
    confidence_score: float                # 0..1 — prob_top10 normalised
    at_risk: bool                          # high DNF or low top-10


class ReliabilityScore(BaseModel):
    model_version: str
    val_metric: Optional[float] = None
    val_metric_name: Optional[str] = None
    test_metric: Optional[float] = None
    train_date: Optional[str] = None
    accuracy_pct: float                    # display-friendly e.g. 94.8


class ApexRaceMeta(BaseModel):
    season: int
    round: int
    race_name: str
    circuit_id: Optional[str] = None
    event_date: Optional[str] = None       # ISO


class ApexResponse(BaseModel):
    race_meta: ApexRaceMeta
    top_prediction: TopPrediction
    podium: list[PodiumSlot]
    reasoning: list[ReasoningBlockOut]
    finish_p4_p10: list[FinishRow]
    reliability: ReliabilityScore
    generated_at: str                      # ISO
    quali_source: str                      # "actual" | "predicted"

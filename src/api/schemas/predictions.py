from typing import Optional
from pydantic import BaseModel, Field


class QualiInput(BaseModel):
    driver_code: str
    team_name: str
    quali_position: int
    q1_time_ms: Optional[float] = None
    q2_time_ms: Optional[float] = None
    q3_time_ms: Optional[float] = None
    best_quali_time_ms: Optional[float] = None


class WeatherForecastInput(BaseModel):
    air_temp_mean: float = 25.0
    track_temp_mean: float = 35.0
    rainfall: bool = False


class PredictionRequest(BaseModel):
    season: int = 2026
    round: int = Field(1, ge=1, le=24)
    circuit_id: str
    weather: WeatherForecastInput = WeatherForecastInput()
    quali: list[QualiInput]
    targets: list[str] = Field(
        default_factory=lambda: ["top10", "podium", "winner", "dnf", "fastest_lap"]
    )


class DriverPrediction(BaseModel):
    driver_code: str
    team_name: str
    quali_position: int
    expected_position: int
    prob_top10: Optional[float] = None
    prob_podium: Optional[float] = None
    prob_win: Optional[float] = None
    prob_dnf: Optional[float] = None
    prob_fastest_lap: Optional[float] = None
    # Conformal uncertainty (winner)
    win_low: Optional[float] = None
    win_high: Optional[float] = None


class PodiumProbability(BaseModel):
    drivers: list[str]
    probability: float


class PredictionResponse(BaseModel):
    season: int
    round: int
    circuit_id: str
    drivers: list[DriverPrediction]
    podium_combinations: list[PodiumProbability] = []


class SimulationRequest(PredictionRequest):
    n_iterations: int = Field(1000, ge=100, le=10000)


class SimulationResponse(BaseModel):
    season: int
    round: int
    n_iterations: int
    win_distribution: dict[str, float]
    podium_distribution: dict[str, float]
    expected_points: dict[str, float]
    podium_combinations: list[PodiumProbability]

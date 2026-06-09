from typing import Optional
from pydantic import BaseModel


class DriverSeasonResult(BaseModel):
    round: int
    race_name: Optional[str] = None
    circuit_id: Optional[str] = None
    grid_position: Optional[int] = None
    finish_position: Optional[int] = None
    points: float = 0.0
    is_dnf: bool = False


class DriverCard(BaseModel):
    driver_code: str
    driver_number: Optional[int] = None
    full_name: Optional[str] = None
    team_name: Optional[str] = None
    team_colour: Optional[str] = None
    headshot_url: Optional[str] = None
    nationality: Optional[str] = None
    country_name: Optional[str] = None
    season_points: float = 0.0
    championship_position: Optional[int] = None
    debut_year: Optional[int] = None
    experience_years: Optional[int] = None


class DriverStandingsRow(BaseModel):
    driver_code: str
    team_name: Optional[str] = None
    points: float
    championship_position: int


class ConstructorStandingsRow(BaseModel):
    team_name: str
    points: float
    constructor_position: int


class StandingsResponse(BaseModel):
    season: int
    drivers: list[DriverStandingsRow]
    constructors: list[ConstructorStandingsRow]


class DriverSeasonRow(BaseModel):
    season: int
    round: int
    driver_code: Optional[str] = None
    race_name: Optional[str] = None
    circuit_id: Optional[str] = None
    team_name: Optional[str] = None
    grid_position: Optional[int] = None
    finish_position: Optional[float] = None
    quali_position: Optional[int] = None
    points: Optional[float] = None
    is_dnf: Optional[bool] = None
    driver_avg_finish_L10: Optional[float] = None


class RadarMetrics(BaseModel):
    qualifying: float
    race_pace: float
    tyre_mgmt: float
    consistency: float
    overtaking: float


class DriverProfile(BaseModel):
    driver_code: str
    current_team: Optional[str] = None
    races: int = 0
    avg_finish_L5: Optional[float] = None
    avg_finish_L10: Optional[float] = None
    dnf_rate_L10: Optional[float] = None
    points_L5: Optional[float] = None
    season_points: Optional[float] = None
    championship_position: Optional[int] = None
    season_results: list[DriverSeasonResult] = []
    timeline: list[DriverSeasonRow] = []
    # Hero + radar additions (Phase 14)
    debut_year: Optional[int] = None
    experience_years: Optional[int] = None
    radar: Optional[RadarMetrics] = None
    aggression_pct: Optional[int] = None
    experience_pct: Optional[int] = None
    last_10: list[DriverSeasonResult] = []
    headshot_url: Optional[str] = None
    nationality: Optional[str] = None
    country_name: Optional[str] = None
    driver_number: Optional[int] = None
    full_name: Optional[str] = None
    team_colour: Optional[str] = None


class TeamTrendRow(BaseModel):
    season: int
    round: int
    team_name: str
    points: float


class CompareResponse(BaseModel):
    drivers: list[str]
    from_season: int
    to_season: int
    rows: list[DriverSeasonRow]

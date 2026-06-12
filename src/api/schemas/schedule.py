from typing import Optional
from pydantic import BaseModel


class CircuitMeta(BaseModel):
    circuit_id: str
    name: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    lap_length_km: Optional[float] = None
    num_corners: Optional[int] = None
    drs_zones: Optional[int] = None
    downforce_level: Optional[str] = None
    overtake_difficulty: Optional[int] = None
    typical_air_temp_c: Optional[float] = None
    wet_race_rate: Optional[float] = None


class WeatherForecast(BaseModel):
    air_temp_mean: Optional[float] = None
    rain_probability_max: Optional[float] = None
    wind_speed_mean: Optional[float] = None
    wet_race_likely: bool = False


class LapRecord(BaseModel):
    circuit_id: str
    driver_code: Optional[str] = None
    driver_name: Optional[str] = None
    time: Optional[str] = None             # e.g. "1:14.260"
    season: Optional[int] = None
    race_name: Optional[str] = None
    average_speed_kph: Optional[float] = None


class RaceEvent(BaseModel):
    season: int
    round: int
    race_name: str
    country: str
    location: str
    circuit_id: str
    event_date: Optional[str] = None
    session5_date: Optional[str] = None
    # FastF1's raw event format ("conventional", "sprint_qualifying", etc.)
    # plus a convenience boolean so the frontend doesn't have to know the
    # naming variants per season.
    event_format: Optional[str] = None
    has_sprint: bool = False
    circuit_meta: Optional[CircuitMeta] = None
    weather_forecast: Optional[WeatherForecast] = None


class ScheduleResponse(BaseModel):
    season: int
    events: list[RaceEvent]


class ResultRow(BaseModel):
    position: Optional[int] = None
    driver_code: str
    driver_number: Optional[int] = None
    team_name: Optional[str] = None
    grid: Optional[int] = None
    points: float = 0.0
    status: Optional[str] = None
    laps: Optional[int] = None
    # P1 carries the absolute race time ("1:30:45.123"); everyone else has
    # a gap string ("+5.234") or None when no time was recorded (DNFs,
    # lapped finishers in older races, etc.).
    time: Optional[str] = None


class ResultsResponse(BaseModel):
    season: int
    round: int
    race_name: Optional[str] = None
    kind: str                 # "race" | "sprint"
    rows: list[ResultRow]

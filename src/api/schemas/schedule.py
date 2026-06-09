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


class RaceEvent(BaseModel):
    season: int
    round: int
    race_name: str
    country: str
    location: str
    circuit_id: str
    event_date: Optional[str] = None
    session5_date: Optional[str] = None
    circuit_meta: Optional[CircuitMeta] = None
    weather_forecast: Optional[WeatherForecast] = None


class ScheduleResponse(BaseModel):
    season: int
    events: list[RaceEvent]

from typing import Optional
from pydantic import BaseModel


class LiveDriver(BaseModel):
    driver_number: Optional[int] = None
    driver_code: str = ""
    full_name: str = ""
    team_name: str = ""
    team_colour: Optional[str] = None
    headshot_url: Optional[str] = None
    position: Optional[int] = None
    gap_to_leader: Optional[str] = None
    interval: Optional[str] = None
    compound: Optional[str] = None
    stint_number: Optional[int] = None
    lap_start: Optional[int] = None
    pit_count: int = 0
    # "DNF" / "DNS" when the snapshot wants the UI to surface a retirement
    # or did-not-start indicator; None for active racers.
    status: Optional[str] = None


class RaceControlMessage(BaseModel):
    date: Optional[str] = None
    category: Optional[str] = None
    flag: Optional[str] = None
    message: Optional[str] = None
    lap_number: Optional[int] = None


class WeatherSample(BaseModel):
    air_temperature: Optional[float] = None
    track_temperature: Optional[float] = None
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    rainfall: bool = False


class LiveSnapshot(BaseModel):
    session_key: Optional[int] = None
    session_name: Optional[str] = None
    session_type: Optional[str] = None
    circuit_short_name: Optional[str] = None
    country_name: Optional[str] = None
    year: Optional[int] = None
    status: str = "unknown"
    track_status: Optional[str] = "AllClear"  # AllClear | Yellow | SC | VSC | Red
    fetched_at: str = ""
    drivers: list[LiveDriver] = []
    race_control: list[RaceControlMessage] = []
    weather: WeatherSample = WeatherSample()


class TelemetryFrame(BaseModel):
    date: str
    speed: Optional[float] = None
    throttle: Optional[float] = None
    brake: Optional[float] = None
    n_gear: Optional[int] = None
    rpm: Optional[float] = None
    drs: Optional[int] = None

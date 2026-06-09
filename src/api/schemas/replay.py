from typing import Optional
from pydantic import BaseModel


class ReplayRaceListEntry(BaseModel):
    season: int
    round: int
    race_name: str
    circuit_id: Optional[str] = None
    event_date: Optional[str] = None
    n_laps: int


class ReplayPodium(BaseModel):
    position: int
    driver_code: str
    team_name: str


class ReplayMeta(BaseModel):
    season: int
    round: int
    race_name: str
    circuit_id: Optional[str] = None
    n_laps: int
    n_drivers: int
    podium: list[ReplayPodium] = []


class WinProbabilityRow(BaseModel):
    driver_code: str
    prob: float


class WinProbabilityFrame(BaseModel):
    lap: int
    rows: list[WinProbabilityRow]


class WinProbabilityResponse(BaseModel):
    season: int
    round: int
    n_laps: int
    drivers: list[str]      # ordered by final finish
    frames: list[WinProbabilityFrame]


class OvertakeEvent(BaseModel):
    lap: int
    time: float
    overtaker_code: str
    overtaker_team: Optional[str] = None
    overtaken_code: Optional[str] = None
    overtaken_team: Optional[str] = None
    new_position: int


class OvertakesResponse(BaseModel):
    season: int
    round: int
    total: int
    events: list[OvertakeEvent]


# ── Continuous trajectory (smooth-playback payload) ──────────────────────────

class TrajectorySamples(BaseModel):
    t:   list[float]
    p:   list[float]
    pos: list[int]
    gap: list[Optional[float]]
    int: list[Optional[float]]


class TrajectoryCompoundChange(BaseModel):
    lap: int
    compound: Optional[str] = None
    stint: Optional[int] = None


class TrajectoryPitWindow(BaseModel):
    lap: int
    in_t: float
    out_t: float


class TrajectoryLapTime(BaseModel):
    lap: int
    t: float
    compound: Optional[str] = None


class TrajectoryDriver(BaseModel):
    code: str
    number: Optional[int] = None
    team_name: str = ""
    team_colour: Optional[str] = None
    samples: TrajectorySamples
    compound_changes: list[TrajectoryCompoundChange] = []
    pit_laps: list[int] = []
    pit_windows: list[TrajectoryPitWindow] = []
    lap_times: list[TrajectoryLapTime] = []
    final_lap: int = 0


class TrajectoryStatusChange(BaseModel):
    t: float
    status: str


class TelemetryWindowResponse(BaseModel):
    driver_code: str
    from_t: float
    to_t: float
    t:        list[float] = []
    speed:    list[int]   = []
    throttle: list[int]   = []
    brake:    list[bool]  = []
    gear:     list[int]   = []
    drs:      list[int]   = []


class DrsZone(BaseModel):
    start: float
    end: float


class TrajectoryResponse(BaseModel):
    season: int
    round: int
    race_name: str
    circuit_id: Optional[str] = None
    n_laps: int
    session_duration_s: float
    race_start_t: float = 0.0
    race_end_t: float = 0.0
    drivers: list[TrajectoryDriver]
    lap_marks: list[float] = []
    track_status_changes: list[TrajectoryStatusChange] = []
    overtakes: list[OvertakeEvent] = []
    drs_zones: list[DrsZone] = []
    sector_marks: list[float] = []   # lap-progress where S1 / S2 end (S3 = 1.0)

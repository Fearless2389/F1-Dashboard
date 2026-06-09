from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    refresher_running: bool = False


class VersionResponse(BaseModel):
    api_version: str = "1.0.0"
    python: str = ""
    fastf1: str = ""

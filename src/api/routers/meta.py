import platform
import sys

from fastapi import APIRouter

from ..schemas import HealthResponse, VersionResponse

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    from ..main import scheduler_state
    return HealthResponse(
        status="ok",
        refresher_running=scheduler_state.get("running", False),
    )


@router.get("/version", response_model=VersionResponse)
def version() -> VersionResponse:
    try:
        import fastf1
        ff1_ver = getattr(fastf1, "__version__", "unknown")
    except Exception:
        ff1_ver = "missing"
    return VersionResponse(
        api_version="1.0.0",
        python=sys.version.split()[0] + f" / {platform.system()}",
        fastf1=ff1_ver,
    )

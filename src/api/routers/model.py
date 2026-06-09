"""Model metadata + explainability endpoints."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..deps import get_manifest, load_model
from ..schemas import ModelManifest, TargetMetrics

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/models", tags=["model"])


@router.get("", response_model=ModelManifest)
def list_models() -> ModelManifest:
    raw = get_manifest()
    targets = [TargetMetrics(**t) for t in raw.get("targets", [])]
    return ModelManifest(
        generated_at=raw.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        targets=targets,
    )


@router.get("/{target}/importance")
def feature_importance(target: str):
    name_map = {
        "top10":       "xgb_top10.pkl",
        "podium":      "xgb_podium.pkl",
        "winner":      "lgbm_winner.pkl",
        "dnf":         "xgb_dnf.pkl",
        "fastest_lap": "lgbm_fastest_lap.pkl",
    }
    if target not in name_map:
        raise HTTPException(404, f"Unknown target {target}")
    artifact = load_model(name_map[target])
    if artifact is None:
        raise HTTPException(404, f"Model not trained: {target}")
    imp = artifact.get("importance")
    if imp is None:
        return {"target": target, "rows": []}
    rows = [{"feature": k, "importance": float(v)}
            for k, v in imp.head(20).to_dict().items()]
    return {"target": target, "rows": rows}


@router.get("/{target}/calibration")
def calibration(target: str):
    name_map = {
        "top10":   "xgb_top10.pkl",
        "podium":  "xgb_podium.pkl",
        "winner":  "lgbm_winner.pkl",
        "dnf":     "xgb_dnf.pkl",
    }
    if target not in name_map:
        raise HTTPException(404, f"Unknown target {target}")
    artifact = load_model(name_map[target])
    if artifact is None:
        raise HTTPException(404, f"Model not trained: {target}")
    cal = artifact.get("calibration")
    if cal is None:
        return {"target": target, "bins": []}
    return {"target": target, "bins": cal.to_dict("records")}

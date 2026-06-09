"""Target registry — one file per prediction target."""

from .base import Target
from . import dnf, fastest_lap, podium, quali, top10, winner_ranker

REGISTRY: dict[str, Target] = {
    "top10":       top10.target,
    "podium":      podium.target,
    "winner":      winner_ranker.target,
    "dnf":         dnf.target,
    "fastest_lap": fastest_lap.target,
    "quali":       quali.target,
}


def get(name: str) -> Target:
    if name not in REGISTRY:
        raise KeyError(f"Unknown target {name}. Available: {list(REGISTRY)}")
    return REGISTRY[name]


def all_names() -> list[str]:
    return list(REGISTRY)


__all__ = ["Target", "REGISTRY", "get", "all_names"]

"""Most-recent-race podium endpoint, sourced from Jolpica (always current)."""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...live import jolpica_client as jolpica
from ...live.schedule import enriched_schedule

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/recent-race", tags=["recent"])


class RecentPodiumRow(BaseModel):
    position: int
    driver_code: str
    team_name: Optional[str] = None


class RecentRaceResponse(BaseModel):
    season: int
    round: int
    race_name: str
    circuit_id: Optional[str] = None
    date: Optional[str] = None
    podium: list[RecentPodiumRow]


@router.get("/{season}", response_model=RecentRaceResponse)
def recent_race(season: int) -> RecentRaceResponse:
    """
    Most-recently-completed race in `season`. Uses Jolpica (cheap, always
    current). Falls back to the schedule + aligned parquet if Jolpica is down.
    """
    # 1) Jolpica path — `/last/results.json` returns just the most-recent
    # completed race (avoids the 100-row pagination cap on the bulk endpoint).
    try:
        results = jolpica.last_race_result(season)
    except Exception as exc:
        log.warning("Jolpica last_race_result failed: %s", exc)
        results = None

    if results is not None and not results.empty:
        last_round = int(results["round"].max())
        sub = results[results["round"] == last_round].sort_values("position")
        if not sub.empty:
            row0 = sub.iloc[0]
            podium = [
                RecentPodiumRow(
                    position=int(r["position"]),
                    driver_code=str(r["driver_code"]),
                    team_name=str(r["team_name"]) if r.get("team_name") else None,
                )
                for _, r in sub.head(3).iterrows()
                if r.get("position") is not None
            ]

            # Find the schedule row to pluck race date + circuit_id we own
            sched = enriched_schedule(season)
            sched_row = sched[sched["round"] == last_round] if not sched.empty else None
            event_date = None
            circuit_id = str(row0.get("circuit_id") or "")
            if sched_row is not None and not sched_row.empty:
                event_date = (
                    str(sched_row.iloc[0]["event_date"])
                    if sched_row.iloc[0].get("event_date") is not None
                    else None
                )
                circuit_id = str(sched_row.iloc[0].get("circuit_id") or circuit_id)

            return RecentRaceResponse(
                season=season,
                round=last_round,
                race_name=str(row0.get("race_name") or ""),
                circuit_id=circuit_id,
                date=event_date,
                podium=podium,
            )

    # 2) Parquet fallback — limited (only seasons we've ingested + cleaned)
    from ..deps import get_aligned_dataset
    df = get_aligned_dataset()
    if df is None:
        raise HTTPException(404, f"No race data for season {season}")
    sub = df[df["season"] == season]
    if sub.empty:
        raise HTTPException(404, f"No race data for season {season}")
    last_round = int(sub["round"].max())
    rrow = sub[sub["round"] == last_round].sort_values("finish_position_clean")
    if rrow.empty:
        raise HTTPException(404, f"No race data for season {season}")
    podium = [
        RecentPodiumRow(
            position=int(r["finish_position_clean"]),
            driver_code=str(r["driver_code"]),
            team_name=str(r.get("team_name") or "") or None,
        )
        for _, r in rrow.head(3).iterrows()
        if r.get("finish_position_clean") is not None
    ]
    return RecentRaceResponse(
        season=season,
        round=last_round,
        race_name=str(rrow.iloc[0].get("race_name") or ""),
        circuit_id=str(rrow.iloc[0].get("circuit_id") or "") or None,
        date=None,
        podium=podium,
    )

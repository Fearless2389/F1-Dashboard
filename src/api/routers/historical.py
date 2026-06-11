"""Historical exploration — driver / team / circuit / compare endpoints."""

import logging
from typing import Optional, Union

from fastapi import APIRouter, HTTPException, Query

from ...live.current_grid import (
    compute_standings,
    constructor_standings,
    get_current_grid,
    season_progression,
    season_results,
)
from ...live.driver_metrics import compute_metrics
from ..deps import get_feature_matrix
from ..schemas import (
    CompareResponse,
    ConstructorStandingsRow,
    DriverCard,
    DriverProfile,
    DriverSeasonResult,
    DriverSeasonRow,
    DriverStandingsRow,
    ProgressionDriver,
    ProgressionRound,
    RadarMetrics,
    StandingsProgressionResponse,
    StandingsResponse,
    TeamTrendRow,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["historical"])


def _row_to_season_row(row: dict) -> DriverSeasonRow:
    import math
    def _num(key, cast=float):
        v = row.get(key)
        if v is None:
            return None
        try:
            f = float(v)
            if math.isnan(f):
                return None
            return cast(f)
        except (TypeError, ValueError):
            return None

    fin = _num("finish_position_clean", float)
    return DriverSeasonRow(
        season=int(row["season"]),
        round=int(row["round"]),
        driver_code=str(row["driver_code"]) if row.get("driver_code") else None,
        race_name=row.get("race_name"),
        circuit_id=row.get("circuit_id"),
        team_name=row.get("team_name"),
        grid_position=_num("grid_position", int),
        finish_position=fin,
        quali_position=_num("quali_position", int),
        points=_num("points", float),
        is_dnf=bool(row.get("is_dnf")) if row.get("is_dnf") is not None else None,
        driver_avg_finish_L10=_num("driver_avg_finish_L10", float),
    )


@router.get("/drivers")
def list_drivers(
    season: Optional[int] = Query(None, description="Return DriverCards for this season"),
    historical: bool = Query(False, description="Return legacy list of code strings"),
) -> Union[list[DriverCard], list[str]]:
    """
    Default: returns the curated current-grid roster (DriverCard objects) for the
    requested season, or 2026 if no season is specified.

    `?historical=true` returns the legacy list of driver codes from the feature
    matrix for back-compat.
    """
    if historical:
        fm = get_feature_matrix()
        if fm is None:
            return []
        return sorted(fm["driver_code"].dropna().unique().tolist())

    target_season = season or 2026
    cards = get_current_grid(target_season)
    if cards:
        return [DriverCard(**c) for c in cards]
    fm = get_feature_matrix()
    if fm is None:
        return []
    sub = fm[fm["season"] == target_season]
    pool = sub if not sub.empty else fm
    return sorted(pool["driver_code"].dropna().unique().tolist())


@router.get("/drivers/{code}", response_model=DriverProfile)
def driver_profile(code: str, season: Optional[int] = Query(None)) -> DriverProfile:
    code = code.upper()
    season_target = season or 2026
    fm = get_feature_matrix()
    hist = fm[fm["driver_code"] == code].copy() if fm is not None else None

    # Look up the roster entry (gives us debut_year, headshot, nationality, etc.)
    roster = get_current_grid(season_target)
    roster_entry = next((r for r in roster if r["driver_code"] == code), None)

    # Real per-driver metrics — computed from the aligned dataset
    metrics = compute_metrics(code, season=season_target)
    radar = RadarMetrics(**metrics["radar"]) if metrics["radar"] else None
    last_10 = [DriverSeasonResult(**r) for r in metrics.get("last_10", [])]

    debut_year = (roster_entry or {}).get("debut_year")
    experience_years = (
        (season_target - int(debut_year)) if debut_year is not None
        else (roster_entry or {}).get("experience_years")
    )

    # Pure-historical case (no entry in feature matrix → rookie / pre-data)
    if hist is None or hist.empty:
        if roster_entry is None:
            raise HTTPException(404, f"No data for driver {code}")
        return DriverProfile(
            driver_code=code,
            current_team=roster_entry.get("team_name"),
            races=metrics.get("career_races", 0),
            season_points=roster_entry.get("season_points"),
            championship_position=roster_entry.get("championship_position"),
            season_results=[DriverSeasonResult(**r) for r in season_results(season_target, code)],
            debut_year=debut_year,
            experience_years=experience_years,
            radar=radar,
            aggression_pct=metrics.get("aggression_pct"),
            experience_pct=metrics.get("experience_pct"),
            last_10=last_10,
            headshot_url=roster_entry.get("headshot_url"),
            nationality=roster_entry.get("nationality"),
            country_name=roster_entry.get("country_name"),
            driver_number=roster_entry.get("driver_number"),
            full_name=roster_entry.get("full_name"),
            team_colour=roster_entry.get("team_colour"),
        )

    hist = hist.sort_values(["season", "round"])
    latest = hist.iloc[-1]
    timeline = [_row_to_season_row(r) for r in hist.to_dict("records")]

    standings_df = compute_standings(season_target)
    season_points = None
    champ_pos = None
    if not standings_df.empty:
        sub = standings_df[standings_df["driver_code"] == code]
        if not sub.empty:
            season_points = float(sub.iloc[0]["points"])
            champ_pos = int(sub.iloc[0]["championship_position"])

    # L10 stats come from compute_metrics now — sourced from the LIVE aligned
    # dataset, not the (potentially stale) feature matrix. This makes each
    # driver render with their actual recent-form numbers.
    return DriverProfile(
        driver_code=code,
        current_team=str(latest.get("team_name") or ""),
        races=metrics.get("career_races") or int(latest.get("driver_experience") or len(hist)),
        avg_finish_L5=float(latest.get("driver_avg_finish_L5"))
            if latest.get("driver_avg_finish_L5") is not None else None,
        avg_finish_L10=metrics.get("avg_finish_L10"),
        dnf_rate_L10=metrics.get("dnf_rate_L10"),
        points_L5=float(latest.get("driver_points_L5"))
            if latest.get("driver_points_L5") is not None else None,
        season_points=season_points,
        championship_position=champ_pos,
        season_results=[DriverSeasonResult(**r) for r in season_results(season_target, code)],
        timeline=timeline,
        debut_year=debut_year,
        experience_years=experience_years,
        radar=radar,
        aggression_pct=metrics.get("aggression_pct"),
        experience_pct=metrics.get("experience_pct"),
        last_10=last_10,
        headshot_url=(roster_entry or {}).get("headshot_url"),
        nationality=(roster_entry or {}).get("nationality"),
        country_name=(roster_entry or {}).get("country_name"),
        driver_number=(roster_entry or {}).get("driver_number"),
        full_name=(roster_entry or {}).get("full_name"),
        team_colour=(roster_entry or {}).get("team_colour"),
    )


@router.get("/standings/{season}", response_model=StandingsResponse)
def standings(
    season: int,
    round_num: int | None = Query(
        None,
        ge=1,
        le=24,
        description="Standings as of the end of this round. Omit for end-of-season totals.",
    ),
) -> StandingsResponse:
    drivers_df = compute_standings(season, round_num=round_num)
    constructors_df = constructor_standings(season, round_num=round_num)
    if drivers_df.empty and constructors_df.empty:
        raise HTTPException(404, f"No standings for season {season}")
    return StandingsResponse(
        season=season,
        drivers=[
            DriverStandingsRow(
                driver_code=str(r["driver_code"]),
                team_name=str(r.get("team_name") or "") or None,
                points=float(r["points"]),
                championship_position=int(r["championship_position"]),
            )
            for _, r in drivers_df.iterrows()
        ],
        constructors=[
            ConstructorStandingsRow(
                team_name=str(r["team_name"]),
                points=float(r["points"]),
                constructor_position=int(r["constructor_position"]),
            )
            for _, r in constructors_df.iterrows()
        ],
    )


@router.get("/standings/{season}/progression", response_model=StandingsProgressionResponse)
def standings_progression(season: int) -> StandingsProgressionResponse:
    """Per-round cumulative points for every driver — drives the championship
    development line chart on the Standings page."""
    data = season_progression(season)
    if not data["drivers"]:
        raise HTTPException(404, f"No progression data for season {season}")
    return StandingsProgressionResponse(
        season=season,
        rounds=[ProgressionRound(**r) for r in data["rounds"]],
        drivers=[ProgressionDriver(**d) for d in data["drivers"]],
    )


@router.get("/teams", response_model=list[str])
def list_teams() -> list[str]:
    fm = get_feature_matrix()
    if fm is None:
        return []
    return sorted(fm["team_name"].dropna().unique().tolist())


@router.get("/teams/{name}/trend", response_model=list[TeamTrendRow])
def team_trend(name: str,
               from_season: Optional[int] = None,
               to_season: Optional[int] = None) -> list[TeamTrendRow]:
    fm = get_feature_matrix()
    if fm is None:
        raise HTTPException(404, "Feature matrix not built")
    df = fm[fm["team_name"].str.lower() == name.lower()].copy()
    if df.empty:
        raise HTTPException(404, f"No data for team {name}")
    if from_season is not None:
        df = df[df["season"] >= from_season]
    if to_season is not None:
        df = df[df["season"] <= to_season]
    grouped = (
        df.groupby(["season", "round"])["points"]
        .sum()
        .reset_index()
        .sort_values(["season", "round"])
    )
    return [
        TeamTrendRow(
            season=int(r["season"]), round=int(r["round"]),
            team_name=name, points=float(r["points"]),
        )
        for r in grouped.to_dict("records")
    ]


@router.get("/compare", response_model=CompareResponse)
def compare_drivers(
    drivers: str = Query(..., description="Comma-separated driver codes (e.g. VER,LEC)"),
    from_season: int = Query(2022),
    to_season: int = Query(2025),
) -> CompareResponse:
    fm = get_feature_matrix()
    if fm is None:
        raise HTTPException(404, "Feature matrix not built")
    codes = [c.strip().upper() for c in drivers.split(",") if c.strip()]
    if not codes:
        raise HTTPException(400, "No driver codes provided")

    sub = fm[
        fm["driver_code"].isin(codes)
        & fm["season"].between(from_season, to_season)
    ].copy()
    sub = sub.sort_values(["driver_code", "season", "round"])
    rows = [_row_to_season_row(r) for r in sub.to_dict("records")]
    return CompareResponse(
        drivers=codes, from_season=from_season, to_season=to_season, rows=rows,
    )


@router.get("/circuits/{circuit_id}/history")
def circuit_history(circuit_id: str, limit: int = 50):
    fm = get_feature_matrix()
    if fm is None:
        raise HTTPException(404, "Feature matrix not built")
    df = fm[fm["circuit_id"].str.lower() == circuit_id.lower()].copy()
    if df.empty:
        return {"winners": [], "pit_times": []}
    winners = (
        df[df["finish_position_clean"] == 1]
        [["season", "round", "driver_code", "team_name"]]
        .sort_values("season")
        .tail(limit)
        .to_dict("records")
    )
    pit_times = []
    if "team_avg_pit_time_ms" in df.columns:
        pit_times = (
            df.groupby("season")["team_avg_pit_time_ms"]
            .mean()
            .reset_index()
            .to_dict("records")
        )
    return {"winners": winners, "pit_times": pit_times}

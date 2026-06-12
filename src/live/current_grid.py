"""
Current 2026 grid + per-season standings.

`get_current_grid(season)` merges the hand-curated `drivers_2026.json` with
OpenF1 `/drivers` (for headshots + team colour). Falls back to JSON-only when
OpenF1 is offline.

`compute_standings(season)` is a pure-parquet groupby on the aligned dataset.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd

from ..ingestion.config import DATA_PROCESSED
from . import jolpica_client as jolpica
from . import openf1_client as f1
from .config import DATA_SCHEDULE

log = logging.getLogger(__name__)


def _canonicalise_team(name: Optional[str]) -> str:
    """Normalise Jolpica/FastF1's team labels to the names our roster + UI use.

    Note: Sauber rebranded as Audi for the 2026 season. We treat "audi" and
    "sauber" as distinct canonical teams now — colour/branding diverged — so
    historical Sauber rows stay separate from 2026 Audi rows.
    """
    if not name:
        return ""
    s = name.lower()
    if "rb f1" in s or "racing bulls" in s: return "Racing Bulls"
    if "alpine" in s:                       return "Alpine"
    if "haas" in s:                         return "Haas"
    if "aston" in s:                        return "Aston Martin"
    if "audi" in s:                         return "Audi"
    if "sauber" in s:                       return "Kick Sauber"
    if "cadillac" in s:                     return "Cadillac"
    if "mclaren" in s:                      return "McLaren"
    if "ferrari" in s:                      return "Ferrari"
    if "mercedes" in s:                     return "Mercedes"
    if "red bull" in s:                     return "Red Bull Racing"
    if "williams" in s:                     return "Williams"
    return name

DRIVERS_2026_FILE = DATA_SCHEDULE / "drivers_2026.json"
ALIGNED_FILE      = DATA_PROCESSED / "aligned_race_dataset.parquet"


# ── Roster loaders ────────────────────────────────────────────────────────────

@lru_cache(maxsize=4)
def _load_curated(season: int) -> list[dict]:
    """Hand-curated roster JSON for a season. Only 2026 ships in v1."""
    path = DATA_SCHEDULE / f"drivers_{season}.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Could not parse %s: %s", path, exc)
        return []


def _openf1_enrich(season: int) -> dict[str, dict]:
    """Map driver_code → {headshot_url, team_colour, ...} from the latest OpenF1 session."""
    sessions = f1.get_sessions(year=season)
    if sessions.empty:
        return {}
    # Pick the most recent session_key for this season
    sk_col = "session_key" if "session_key" in sessions.columns else None
    if sk_col is None:
        return {}
    try:
        latest_sk = int(sessions[sk_col].max())
    except Exception:
        return {}
    drivers = f1.get_drivers(latest_sk)
    if drivers.empty:
        return {}
    out: dict[str, dict] = {}
    for _, r in drivers.iterrows():
        code = r.get("name_acronym")
        if not code:
            continue
        out[str(code)] = {
            "headshot_url": r.get("headshot_url"),
            "team_colour":  f"#{r['team_colour']}" if r.get("team_colour") else None,
            "first_name":   r.get("first_name"),
            "last_name":    r.get("last_name"),
        }
    return out


# ── Standings ─────────────────────────────────────────────────────────────────

def _load_aligned() -> Optional[pd.DataFrame]:
    if not ALIGNED_FILE.exists():
        return None
    return pd.read_parquet(ALIGNED_FILE)


def compute_standings(season: int, round_num: Optional[int] = None) -> pd.DataFrame:
    """
    Driver standings — prefers Jolpica (always up-to-date) when reachable,
    falls back to the local aligned dataset otherwise.

        driver_code | team_name | points | championship_position

    When `round_num` is supplied, returns the standings as of the *end of
    that round* (i.e. before any later races' points are tallied). This is
    what surfaces the famous HAM = VER = 369.5 tie going into Abu Dhabi
    2021 — both at 369.5 after round 21.
    """
    try:
        jdf = jolpica.driver_standings(season, round_num)
        if not jdf.empty:
            jdf = jdf.copy()
            jdf["team_name"] = jdf["team_name"].map(_canonicalise_team)
            return jdf[["driver_code", "team_name", "points", "championship_position"]]
    except Exception as exc:
        log.warning("Jolpica driver standings failed: %s", exc)

    df = _load_aligned()
    if df is None:
        return pd.DataFrame()
    sub = df[df["season"] == season]
    if round_num is not None and "round" in sub.columns:
        sub = sub[sub["round"] <= round_num]
    if sub.empty:
        return pd.DataFrame()

    by_driver = (
        sub.groupby("driver_code", as_index=False)
        .agg(points=("points", "sum"),
             team_name=("team_name", "last"))
        .sort_values("points", ascending=False)
        .reset_index(drop=True)
    )
    by_driver["championship_position"] = range(1, len(by_driver) + 1)
    return by_driver


def constructor_standings(season: int, round_num: Optional[int] = None) -> pd.DataFrame:
    """Constructor standings — mirrors `compute_standings` for teams.

    `round_num`, when given, returns the constructor table as of that round.
    """
    try:
        jdf = jolpica.constructor_standings(season, round_num)
        if not jdf.empty:
            jdf = jdf.copy()
            jdf["team_name"] = jdf["team_name"].map(_canonicalise_team)
            return jdf[["team_name", "points", "constructor_position"]]
    except Exception as exc:
        log.warning("Jolpica constructor standings failed: %s", exc)

    df = _load_aligned()
    if df is None:
        return pd.DataFrame()
    sub = df[df["season"] == season]
    if round_num is not None and "round" in sub.columns:
        sub = sub[sub["round"] <= round_num]
    if sub.empty:
        return pd.DataFrame()
    return (
        sub.groupby("team_name", as_index=False)["points"].sum()
        .sort_values("points", ascending=False)
        .reset_index(drop=True)
        .assign(constructor_position=lambda d: range(1, len(d) + 1))
    )


def season_progression(season: int) -> dict:
    """
    Per-round cumulative points for every driver in `season`. Drives the
    championship-development line chart on the Standings page.

    Returns: {
        "rounds":  [ {"round": 1, "race_name": "Bahrain Grand Prix"}, ... ],
        "drivers": [ {"driver_code": "VER",
                      "team_name": "Red Bull Racing",
                      "cumulative_points": [25.0, 43.0, 61.0, ...]}, ... ]
    }

    Sorted by final cumulative points descending (championship order).
    Falls back to the local aligned dataset if Jolpica is unreachable.
    """
    df = pd.DataFrame()
    try:
        df = jolpica.race_results(season)
    except Exception as exc:
        log.warning("Jolpica race_results failed for progression: %s", exc)

    if df.empty:
        local = _load_aligned()
        if local is not None:
            sub = local[local["season"] == season]
            if not sub.empty:
                df = sub.rename(columns={"finish_position_clean": "position"})[
                    ["season", "round", "race_name", "driver_code", "team_name", "points"]
                ].copy()

    if df.empty:
        return {"rounds": [], "drivers": []}

    # Merge sprint points — Jolpica's /results endpoint returns race points
    # only, so the cumulative championship line was under-counting at every
    # sprint-weekend round. Concat sprint rows so the per-round pivot below
    # sums race + sprint into a single value. Sprint fetch failures
    # degrade silently to "race points only" instead of breaking the chart.
    try:
        sprint_df = jolpica.sprint_results_season(season)
    except Exception as exc:
        log.warning("Jolpica sprint_results_season failed for progression: %s", exc)
        sprint_df = pd.DataFrame()
    if not sprint_df.empty:
        df = pd.concat(
            [df, sprint_df[["season", "round", "race_name", "driver_code", "team_name", "points"]]],
            ignore_index=True,
        )

    df = df.copy()
    df["team_name"] = df["team_name"].map(_canonicalise_team)
    df = df.sort_values(["round", "driver_code"])

    rounds_df = (
        df[["round", "race_name"]]
        .drop_duplicates("round")
        .sort_values("round")
    )
    rounds = [
        {"round": int(r["round"]), "race_name": str(r.get("race_name") or "")}
        for _, r in rounds_df.iterrows()
    ]
    round_seq = [r["round"] for r in rounds]

    points_per_round = (
        df.pivot_table(
            index="driver_code", columns="round", values="points",
            aggfunc="sum", fill_value=0.0,
        )
        .reindex(columns=round_seq, fill_value=0.0)
    )
    cumulative = points_per_round.cumsum(axis=1)

    final_pts = cumulative.iloc[:, -1] if cumulative.shape[1] else cumulative.sum(axis=1)
    ordered_drivers = final_pts.sort_values(ascending=False).index.tolist()

    # Most-recent team for each driver (their seat at the latest round they entered).
    latest_team = (
        df.sort_values("round")
        .groupby("driver_code")["team_name"]
        .last()
    )

    drivers = [
        {
            "driver_code":       code,
            "team_name":         latest_team.get(code) or None,
            "cumulative_points": [float(v) for v in cumulative.loc[code].tolist()],
        }
        for code in ordered_drivers
    ]
    return {"rounds": rounds, "drivers": drivers}


def season_results(season: int, driver_code: str) -> list[dict]:
    """
    Per-race results for a driver in `season`. Prefers Jolpica (current),
    falls back to the local aligned dataset.
    """
    try:
        jdf = jolpica.race_results(season)
        if not jdf.empty:
            sub = jdf[jdf["driver_code"] == driver_code].sort_values("round")
            if not sub.empty:
                return [
                    {
                        "round":           int(r["round"]),
                        "race_name":       str(r.get("race_name") or ""),
                        "circuit_id":      str(r.get("circuit_id") or ""),
                        "grid_position":   int(r["grid"]) if pd.notna(r.get("grid")) else None,
                        "finish_position": int(r["position"]) if pd.notna(r.get("position")) else None,
                        "points":          float(r["points"]) if pd.notna(r.get("points")) else 0.0,
                        "is_dnf":          str(r.get("status") or "").lower() not in {
                            "finished", "+1 lap", "+2 laps", "+3 laps", "+4 laps", "+5 laps",
                        },
                    }
                    for _, r in sub.iterrows()
                ]
    except Exception as exc:
        log.warning("Jolpica season_results failed: %s", exc)

    df = _load_aligned()
    if df is None:
        return []
    sub = df[(df["season"] == season) & (df["driver_code"] == driver_code)]
    if sub.empty:
        return []
    sub = sub.sort_values("round")
    out = []
    for _, r in sub.iterrows():
        fin = r.get("finish_position_clean")
        out.append({
            "round":           int(r["round"]),
            "race_name":       str(r.get("race_name") or ""),
            "circuit_id":      str(r.get("circuit_id") or ""),
            "grid_position":   int(r["grid_position"]) if pd.notna(r.get("grid_position")) else None,
            "finish_position": int(fin) if pd.notna(fin) else None,
            "points":          float(r["points"]) if pd.notna(r.get("points")) else 0.0,
            "is_dnf":          bool(r.get("is_dnf")),
        })
    return out


# ── Public: full current-grid roster ──────────────────────────────────────────

def _grid_from_race_data(season: int) -> list[dict]:
    """Build the season's roster directly from the aligned race-results parquet.

    For seasons where we actually have race data, this is the ground truth —
    each row tells us who raced under which team in their most recent round.
    The curated `drivers_{season}.json` files go stale across the year as
    seats change (TSU → out, HAD → Red Bull, Sauber → Audi for 2026); race
    data doesn't.
    """
    df = _load_aligned()
    if df is None:
        return []
    sub = df[df["season"] == season]
    if sub.empty:
        return []
    grouped = (
        sub.sort_values(["round"])
        .groupby("driver_code", as_index=False)
        .agg(last_team=("team_name", "last"),
             driver_number=("driver_number", "first"))
    )
    out: list[dict] = []
    for _, row in grouped.iterrows():
        code = str(row["driver_code"])
        team_raw = str(row["last_team"]) if pd.notna(row.get("last_team")) else None
        out.append({
            "driver_code":   code,
            "driver_number": int(row["driver_number"]) if pd.notna(row.get("driver_number")) else None,
            "team_name":     _canonicalise_team(team_raw) if team_raw else None,
        })
    return out


def get_current_grid(season: int = 2026) -> list[dict]:
    """
    Roster for `season`, enriched with OpenF1 photos + standings.

    Priority order:
      1. If race data for the season exists in the aligned dataset, that's
         the source of truth for who is racing and which team. Curated JSON
         supplies metadata (full name, nationality, debut year) when it
         agrees on the driver code.
      2. Otherwise (future seasons with no races yet), fall back to the
         curated `drivers_{season}.json`.
      3. If neither exists, return an empty list.

    This is what makes Audi (was Sauber) appear correctly, removes TSU from
    the 2026 grid, and surfaces HAD at Red Bull as soon as he actually races
    there — without needing a manual JSON edit.
    """
    race_grid = _grid_from_race_data(season)
    curated = _load_curated(season)
    curated_by_code = {d["driver_code"]: d for d in curated}

    try:
        of1 = _openf1_enrich(season)
    except Exception as exc:
        log.warning("OpenF1 enrich failed: %s", exc)
        of1 = {}

    standings = compute_standings(season)
    standings_by_code = {
        row["driver_code"]: row for _, row in standings.iterrows()
    } if not standings.empty else {}

    if race_grid:
        out: list[dict] = []
        for entry in race_grid:
            code = entry["driver_code"]
            enrich = of1.get(code, {})
            stand = standings_by_code.get(code)
            curated_entry = curated_by_code.get(code, {})
            debut = curated_entry.get("debut_year")
            experience_years = (season - int(debut)) if debut else None
            out.append({
                "driver_code":          code,
                # race data wins for driver_number when present (curated may be stale)
                "driver_number":        entry.get("driver_number") or curated_entry.get("driver_number"),
                "full_name":            curated_entry.get("full_name") or code,
                "team_name":            entry["team_name"],
                "team_colour":          enrich.get("team_colour"),
                "headshot_url":         enrich.get("headshot_url"),
                "nationality":          curated_entry.get("nationality"),
                "country_name":         curated_entry.get("country_name"),
                "season_points":        float(stand["points"]) if stand is not None else 0.0,
                "championship_position": int(stand["championship_position"]) if stand is not None else None,
                "debut_year":           debut,
                "experience_years":     experience_years,
            })
        out.sort(key=lambda d: (
            d["championship_position"] if d["championship_position"] is not None else 99,
            -d["season_points"],
        ))
        return out

    # No race data — fall through to curated-only build (future seasons).
    if curated:
        out: list[dict] = []
        for d in curated:
            code = d["driver_code"]
            enrich = of1.get(code, {})
            stand = standings_by_code.get(code)
            debut = d.get("debut_year")
            experience_years = (season - int(debut)) if debut else None
            out.append({
                "driver_code":          code,
                "driver_number":        d.get("driver_number"),
                "full_name":            d.get("full_name"),
                "team_name":            d.get("team_name"),
                "team_colour":          enrich.get("team_colour"),
                "headshot_url":         enrich.get("headshot_url"),
                "nationality":          d.get("nationality"),
                "country_name":         d.get("country_name"),
                "season_points":        float(stand["points"]) if stand is not None else 0.0,
                "championship_position": int(stand["championship_position"]) if stand is not None else None,
                "debut_year":           debut,
                "experience_years":     experience_years,
            })
        return out

    # Neither race data nor a curated roster — nothing to return.
    return []

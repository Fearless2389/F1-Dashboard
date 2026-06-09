"""
Auto race recap - slot-fills sentence templates with features pulled from
the existing race-results endpoint + replay overtake feed. No LLM calls,
no extra data sources. Same SHAP-templated philosophy as `apex.py`.

Public entry point: `generate_recap(season, round_num) -> dict | None`

Returned shape:
    {
        "season":      int,
        "round":       int,
        "race_name":   str,
        "headline":    str,
        "lead":        str,
        "highlights":  [{"label": str, "text": str}],
    }
"""

from __future__ import annotations

import logging
from typing import Optional

from ..live import jolpica_client as jolpica
from ..live.replay import load_race

log = logging.getLogger(__name__)

# Em-dash literal used in user-facing strings. Stored as a constant so the
# source file stays ASCII-clean and isn't at the mercy of editor encodings.
EMDASH = "—"

# Jolpica's status strings for a classified finish vs. a retirement.
_FINISHED_STATUSES = {
    "Finished",
    "+1 Lap", "+2 Laps", "+3 Laps", "+4 Laps", "+5 Laps",
    "+6 Laps", "+7 Laps", "+8 Laps", "+9 Laps", "+10 Laps",
}


def _is_dnf(status: object) -> bool:
    s = str(status or "")
    return s not in _FINISHED_STATUSES


def _winner_verb(grid: int, lead_changes: int) -> str:
    """How did the winner win? Returns a verb phrase like 'converts pole into'."""
    if grid <= 1 and lead_changes == 0:
        return "converts pole into a lights-to-flag"
    if grid <= 1 and lead_changes <= 2:
        return "converts pole into a commanding"
    if grid <= 1:
        return "holds on for a hard-fought"
    if 2 <= grid <= 4:
        return f"surges from P{grid} for a fine"
    if 5 <= grid <= 9:
        return f"charges from P{grid} for a memorable"
    return f"storms from P{grid} for a stunning"


def _format_team(name: Optional[str]) -> str:
    if not name:
        return "their team"
    return str(name)


def generate_recap(season: int, round_num: int) -> Optional[dict]:
    results = jolpica.race_results(season, round_num)
    if results.empty:
        return None

    race_name = str(results["race_name"].iloc[0])
    results = results.copy()

    # Sort by classified position (NaN/missing pushed to the bottom).
    results["pos_sortable"] = results["position"].fillna(99)
    sorted_results = results.sort_values("pos_sortable")

    podium = sorted_results.head(3)
    if podium.empty:
        return None

    winner_row     = podium.iloc[0]
    winner_code    = str(winner_row.get("driver_code", "") or "")
    winner_team    = _format_team(winner_row.get("team_name"))
    winner_grid    = int(winner_row.get("grid") or 0)

    p2_code = str(podium.iloc[1]["driver_code"]) if len(podium) > 1 else None
    p3_code = str(podium.iloc[2]["driver_code"]) if len(podium) > 2 else None

    poles = results[results["grid"] == 1]
    pole_code = str(poles["driver_code"].iloc[0]) if not poles.empty else None

    # DNFs - anyone whose status doesn't read like a classified finish.
    dnfs = results[results.apply(lambda r: _is_dnf(r.get("status")), axis=1)]
    dnf_count = len(dnfs)

    # Biggest mover - largest grid-to-finish improvement among classified finishers.
    finished = results.dropna(subset=["position"])
    finished = finished[(finished["grid"] > 0)]
    biggest_mover_code: Optional[str] = None
    biggest_mover_gain = 0
    biggest_mover_grid = 0
    biggest_mover_finish = 0
    if not finished.empty:
        finished = finished.copy()
        finished["gain"] = finished["grid"] - finished["position"]
        bm_row = finished.nlargest(1, "gain").iloc[0]
        if bm_row["gain"] > 0:
            biggest_mover_code   = str(bm_row["driver_code"])
            biggest_mover_gain   = int(bm_row["gain"])
            biggest_mover_grid   = int(bm_row["grid"])
            biggest_mover_finish = int(bm_row["position"])

    # Overtakes / lead changes - best-effort, hidden when replay data isn't cached.
    overtakes: list[dict] = []
    try:
        race = load_race(season, round_num)
        if race is not None:
            overtakes = race.overtakes()
    except Exception as exc:
        log.debug("Recap: could not load replay overtakes for %s R%s: %s", season, round_num, exc)

    lead_changes = sum(1 for o in overtakes if int(o.get("new_position", 0)) == 1)

    move_of_race_text: Optional[str] = None
    if overtakes:
        for_lead = [o for o in overtakes if int(o.get("new_position", 0)) == 1]
        if for_lead:
            last_lead = max(for_lead, key=lambda o: o.get("lap", 0))
            overtaken = last_lead.get("overtaken_code") or EMDASH
            move_of_race_text = (
                f"{last_lead['overtaker_code']} took the lead from "
                f"{overtaken} on lap {last_lead['lap']}"
            )
        else:
            # Without per-overtake position-swing magnitude we settle on the
            # highest-position overtake (smallest new_position) as the proxy
            # for "most consequential move".
            best = min(overtakes, key=lambda o: int(o.get("new_position", 99)))
            overtaken = best.get("overtaken_code") or EMDASH
            move_of_race_text = (
                f"{best['overtaker_code']} on {overtaken} "
                f"at lap {best['lap']} for P{best['new_position']}"
            )

    # Headline
    short_race = race_name.replace("Grand Prix", "GP")
    headline = f"{winner_code} {_winner_verb(winner_grid, lead_changes)} {short_race} win"

    # Lead paragraph - sentences kept short so the slot-fills remain readable.
    lead_parts: list[str] = []

    if winner_grid <= 1:
        lead_parts.append(
            f"{winner_code} converted pole into victory at the {race_name}, "
            f"taking {winner_team}'s win as they crossed the line first."
        )
    else:
        pole_phrase = ""
        if pole_code and pole_code != winner_code:
            pole_phrase = f" {pole_code} had started from pole but couldn't make it stick."
        lead_parts.append(
            f"{winner_code} took the {race_name} victory for {winner_team}, "
            f"climbing from P{winner_grid} on the grid.{pole_phrase}"
        )

    if p2_code and p3_code:
        lead_parts.append(f"{p2_code} crossed the line second, with {p3_code} completing the podium.")
    elif p2_code:
        lead_parts.append(f"{p2_code} crossed the line second.")

    if lead_changes >= 3:
        lead_parts.append(f"The lead changed hands {lead_changes} times across the afternoon.")
    elif lead_changes == 2:
        lead_parts.append("The race saw two changes at the front before the result settled.")
    elif lead_changes == 1 and winner_grid > 1:
        lead_parts.append("There was a single decisive change at the front before the result settled.")

    if dnf_count >= 5:
        lead_parts.append(
            f"It was an attrition-heavy race {EMDASH} {dnf_count} cars failed to see the chequered flag."
        )
    elif dnf_count >= 1:
        lead_parts.append(
            f"{dnf_count} car{'s' if dnf_count != 1 else ''} did not finish."
        )

    lead = " ".join(lead_parts)

    # Highlights
    highlights: list[dict] = []

    if move_of_race_text:
        highlights.append({"label": "Move of the race", "text": move_of_race_text})

    if biggest_mover_code:
        highlights.append({
            "label": "Biggest mover",
            "text": (
                f"{biggest_mover_code} climbed {biggest_mover_gain} places {EMDASH} "
                f"P{biggest_mover_grid} on the grid to P{biggest_mover_finish}"
            ),
        })

    if pole_code:
        if pole_code == winner_code:
            highlights.append({
                "label": "Pole sitter",
                "text": f"{pole_code} converted from P1 on the grid",
            })
        else:
            highlights.append({
                "label": "Pole sitter",
                "text": f"{pole_code} {EMDASH} could not convert from pole",
            })

    if dnf_count >= 1:
        dnf_codes_series = dnfs["driver_code"].head(3).astype(str).tolist()
        listed = ", ".join(dnf_codes_series)
        more = f" + {dnf_count - 3} more" if dnf_count > 3 else ""
        highlights.append({
            "label": f"DNFs ({dnf_count})",
            "text": f"{listed}{more}",
        })

    # Cap at 4 chips so the row stays a single line on tablet widths.
    highlights = highlights[:4]

    return {
        "season":     int(season),
        "round":      int(round_num),
        "race_name":  race_name,
        "headline":   headline,
        "lead":       lead,
        "highlights": highlights,
    }

"""
SHAP → human-readable prose templates for the Apex Predictor reasoning column.

Each entry maps a feature name from `src/models/config.py:PRE_RACE_FEATURES`
to a small spec:
    label   — the section heading shown above the block (UPPERCASE)
    fmt(v)  — turns the feature value into a single sentence

Impact tier is computed dynamically from |SHAP value|:
    >= 0.5   → HIGH
    0.2-0.5  → MEDIUM
    < 0.2    → LOW

Coverage today: 9 features. If SHAP's top-3 features all happen to have no
template (extremely unlikely), we fall through to the next-best feature so
the column always emits exactly 3 blocks.
"""

from dataclasses import dataclass
from typing import Callable, Optional


@dataclass
class ReasoningBlock:
    label: str          # e.g. "TYRE DEGRADATION"
    impact: str         # HIGH | MEDIUM | LOW
    text: str           # the human sentence
    feature: str        # source SHAP feature (for debugging / introspection)


def _safe(v) -> Optional[float]:
    try:
        if v is None:
            return None
        f = float(v)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def _tier(shap_value: float) -> str:
    a = abs(shap_value)
    if a >= 0.5:
        return "HIGH"
    if a >= 0.2:
        return "MEDIUM"
    return "LOW"


# fmt callbacks: (value, shap_sign) → text
# shap_sign > 0 means feature is pushing this prediction higher

def _fmt_quali_gap(v: float, sgn: float) -> str:
    if v is None:
        return "Qualifying gap unavailable for this driver."
    secs = v / 1000.0
    if secs < 0.05:
        return f"Stuck to pole-sitter — {secs:.3f}s off."
    if secs < 0.4:
        return f"Strong qualifying lap — {secs:.3f}s off pole."
    if secs < 1.0:
        return f"Mid-pack qualifying — {secs:.3f}s off pole."
    return f"Big qualifying gap — {secs:.3f}s off pole."


def _fmt_avg_finish(label: str) -> Callable[[float, float], str]:
    def inner(v: float, sgn: float) -> str:
        if v is None:
            return f"{label} unavailable."
        return f"{label} averaging P{v:.1f}."
    return inner


def _fmt_pit(v: float, sgn: float) -> str:
    if v is None:
        return "Team pit-stop data unavailable."
    s = v / 1000.0
    if s < 2.5:
        return f"Team pit average {s:.2f}s — among the quickest on the grid."
    if s < 3.0:
        return f"Team pit average {s:.2f}s — solid mid-pack."
    return f"Team pit average {s:.2f}s — slower than rivals."


def _fmt_dnf(label: str) -> Callable[[float, float], str]:
    def inner(v: float, sgn: float) -> str:
        if v is None:
            return f"{label} reliability data unavailable."
        pct = v * 100
        if pct < 5:
            return f"{label} DNF rate {pct:.0f}% — very reliable."
        if pct < 15:
            return f"{label} DNF rate {pct:.0f}% — typical for the field."
        return f"{label} DNF rate {pct:.0f}% — elevated risk of retirement."
    return inner


def _fmt_circuit_avg(v: float, sgn: float) -> str:
    if v is None:
        return "No prior history at this circuit."
    return f"Historical average finish here: P{v:.1f}."


def _fmt_round(v: float, sgn: float) -> str:
    if v is None:
        return "Race round unknown."
    rn = int(v)
    if rn <= 5:
        return f"Early season — round {rn} of 24."
    if rn >= 18:
        return f"Late-season pressure — round {rn} of 24."
    return f"Mid-season round {rn}."


def _fmt_rainfall(v: float, sgn: float) -> str:
    if v and v > 0.5:
        if sgn > 0:
            return "Wet conditions forecast — favours this driver's wet-weather pace."
        return "Wet conditions forecast — historically a weakness for this driver."
    return "Dry conditions per forecast."


def _fmt_median_lap(v: float, sgn: float) -> str:
    if v is None:
        return "Race-trim pace unavailable."
    return f"Median clean-lap pace projecting {v/1000:.3f}s."


REASONING_TEMPLATES: dict[str, dict] = {
    "quali_gap_to_pole_ms": {
        "label": "QUALIFYING",
        "fmt": _fmt_quali_gap,
    },
    "driver_avg_finish_L5": {
        "label": "DRIVER FORM",
        "fmt": _fmt_avg_finish("Recent form"),
    },
    "driver_avg_finish_L10": {
        "label": "DRIVER FORM",
        "fmt": _fmt_avg_finish("Long-run form"),
    },
    "team_avg_pit_time_ms": {
        "label": "PIT STOPS",
        "fmt": _fmt_pit,
    },
    "driver_dnf_rate_L10": {
        "label": "RELIABILITY",
        "fmt": _fmt_dnf("Driver"),
    },
    "team_dnf_rate_L10": {
        "label": "AERO EFFICIENCY",
        "fmt": _fmt_dnf("Team"),
    },
    "driver_circuit_avg_finish": {
        "label": "TRACK HISTORY",
        "fmt": _fmt_circuit_avg,
    },
    "round_number": {
        "label": "SEASON STAGE",
        "fmt": _fmt_round,
    },
    "rainfall": {
        "label": "WEATHER",
        "fmt": _fmt_rainfall,
    },
    "median_clean_lap_ms": {
        "label": "TYRE DEGRADATION",
        "fmt": _fmt_median_lap,
    },
}


def reasoning_blocks(
    features: list[str],
    shap_values: list[float],
    feature_values: list[float],
    top_n: int = 3,
) -> list[ReasoningBlock]:
    """
    Return up to `top_n` reasoning blocks for a single driver row, ranked
    by |SHAP|. If the top-3 features all lack a template, fall through to
    the next-most-important ones so we always try to emit `top_n` blocks.
    """
    if len(features) != len(shap_values) or len(features) != len(feature_values):
        raise ValueError("features / shap_values / feature_values must align")

    triples = sorted(
        zip(features, shap_values, feature_values),
        key=lambda t: abs(t[1]),
        reverse=True,
    )

    blocks: list[ReasoningBlock] = []
    for feat, shap_val, feat_val in triples:
        if len(blocks) >= top_n:
            break
        tpl = REASONING_TEMPLATES.get(feat)
        if tpl is None:
            continue
        text = tpl["fmt"](_safe(feat_val), float(shap_val))
        blocks.append(ReasoningBlock(
            label=tpl["label"],
            impact=_tier(shap_val),
            text=text,
            feature=feat,
        ))
    return blocks

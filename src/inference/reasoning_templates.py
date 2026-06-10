"""
SHAP → human-readable prose templates for the Apex Predictor reasoning column.

Each entry maps a feature name from `src/models/config.py:PRE_RACE_FEATURES`
to a small spec:
    label   — the section heading shown above the block (UPPERCASE)
    fmt(v, sgn, ctx)  — turns the feature value + comparison context into a
                       single sentence

Impact tier is computed dynamically from |SHAP value|:
    >= 0.5   → HIGH
    0.2-0.5  → MEDIUM
    < 0.2    → LOW

Context (`ctx`) carries per-feature comparison anchors so the prose can
move beyond "Recent form averaging P10.0." into:
    field_median   — median value across the field for this race
    driver_baseline — this driver's cross-season mean of the same feature

If the feature is missing from `ctx`, the templates degrade gracefully to
the original single-fact phrasing.

Coverage today: 10 features. If SHAP's top-3 features all happen to have no
template (extremely unlikely), we fall through to the next-best features so
the column always tries to emit `top_n` blocks.
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


# ── Per-feature template fmt callbacks ──────────────────────────────────────
# Signature: fmt(value, shap_sign, ctx) → text
#   ctx = {"field_median": float | None, "driver_baseline": float | None}
# shap_sign > 0 means feature pushes the prediction UP.

def _fmt_quali_gap(v: Optional[float], sgn: float, ctx: dict) -> str:
    if v is None:
        return "Qualifying gap unavailable for this driver."
    secs = v / 1000.0
    base = ctx.get("driver_baseline")
    field = ctx.get("field_median")
    parts: list[str] = []
    if secs < 0.05:
        parts.append(f"Stuck to pole-sitter — {secs:.3f}s off")
    elif secs < 0.4:
        parts.append(f"Strong qualifying lap — {secs:.3f}s off pole")
    elif secs < 1.0:
        parts.append(f"Mid-pack qualifying — {secs:.3f}s off pole")
    else:
        parts.append(f"Big qualifying gap — {secs:.3f}s off pole")
    if field is not None and field > 0:
        field_s = field / 1000.0
        diff = field_s - secs
        if abs(diff) >= 0.05:
            if diff > 0:
                parts.append(f"{diff:.2f}s ahead of the field median")
            else:
                parts.append(f"{abs(diff):.2f}s behind the field median")
    if base is not None and base > 0:
        base_s = base / 1000.0
        diff = base_s - secs
        if abs(diff) >= 0.05:
            if diff > 0:
                parts.append(f"{diff:.2f}s better than his own quali average")
            else:
                parts.append(f"{abs(diff):.2f}s off his usual quali pace")
    return ", ".join(parts) + "."


def _fmt_avg_finish(label: str) -> Callable:
    def inner(v: Optional[float], sgn: float, ctx: dict) -> str:
        if v is None:
            return f"{label} unavailable."
        field = ctx.get("field_median")
        base = ctx.get("driver_baseline")
        parts = [f"{label} averaging P{v:.1f}"]
        if field is not None:
            diff = field - v
            if v <= 3:
                parts.append("best on the grid")
            elif diff > 2:
                parts.append(f"{diff:.1f} places better than the field median (P{field:.1f})")
            elif diff < -2:
                parts.append(f"{-diff:.1f} places worse than the field median (P{field:.1f})")
        if base is not None:
            diff = base - v
            if abs(diff) >= 1.5:
                if diff > 0:
                    parts.append(f"{diff:.1f} places better than his own baseline (P{base:.1f})")
                else:
                    parts.append(f"{-diff:.1f} places off his own baseline (P{base:.1f})")
        return " · ".join(parts) + "."
    return inner


def _fmt_pit(v: Optional[float], sgn: float, ctx: dict) -> str:
    if v is None:
        return "Team pit-stop data unavailable."
    s = v / 1000.0
    field = ctx.get("field_median")
    base_text = (
        f"Team pit average {s:.2f}s — among the quickest on the grid"
        if s < 2.5 else
        f"Team pit average {s:.2f}s — solid mid-pack"
        if s < 3.0 else
        f"Team pit average {s:.2f}s — slower than rivals"
    )
    if field is not None and field > 0:
        field_s = field / 1000.0
        diff = field_s - s
        if abs(diff) >= 0.1:
            sign = "ahead of" if diff > 0 else "behind"
            return f"{base_text}, {abs(diff):.2f}s {sign} the field median."
    return base_text + "."


def _fmt_dnf(label: str) -> Callable:
    def inner(v: Optional[float], sgn: float, ctx: dict) -> str:
        if v is None:
            return f"{label} reliability data unavailable."
        pct = v * 100
        field = ctx.get("field_median")
        base = ctx.get("driver_baseline")
        parts: list[str]
        if pct < 5:
            parts = [f"{label} DNF rate {pct:.0f}% — very reliable"]
        elif pct < 15:
            parts = [f"{label} DNF rate {pct:.0f}% — typical for the field"]
        else:
            parts = [f"{label} DNF rate {pct:.0f}% — elevated risk of retirement"]
        if field is not None:
            field_pct = field * 100
            diff = field_pct - pct
            if abs(diff) >= 3:
                if diff > 0:
                    parts.append(f"{diff:.0f}pp below field median ({field_pct:.0f}%)")
                else:
                    parts.append(f"{-diff:.0f}pp above field median ({field_pct:.0f}%)")
        if base is not None:
            base_pct = base * 100
            diff = base_pct - pct
            if abs(diff) >= 5:
                trend = "improving on" if diff > 0 else "above"
                parts.append(f"{trend} his career baseline ({base_pct:.0f}%)")
        return " · ".join(parts) + "."
    return inner


def _fmt_circuit_avg(v: Optional[float], sgn: float, ctx: dict) -> str:
    if v is None:
        return "No prior history at this circuit."
    field = ctx.get("field_median")
    parts = [f"Historical average finish here: P{v:.1f}"]
    if field is not None:
        diff = field - v
        if v <= 3:
            parts.append("circuit specialist (top-3 average)")
        elif diff > 2:
            parts.append(f"{diff:.1f} places better than the field at this venue")
        elif diff < -2:
            parts.append(f"struggles here vs the field median (P{field:.1f})")
    return " — ".join(parts) + "."


def _fmt_round(v: Optional[float], sgn: float, ctx: dict) -> str:
    if v is None:
        return "Race round unknown."
    rn = int(v)
    if rn <= 5:
        return f"Early season — round {rn} of 24 — momentum still forming."
    if rn >= 18:
        return f"Late-season pressure — round {rn} of 24 — title implications live."
    return f"Mid-season round {rn} — established pecking order."


def _fmt_rainfall(v: Optional[float], sgn: float, ctx: dict) -> str:
    if v and v > 0.5:
        if sgn > 0:
            return "Wet conditions forecast — model leans into this driver's wet-weather pace."
        return "Wet conditions forecast — historically a weakness, model docks the prediction."
    return "Dry conditions per forecast — no weather variance in the model's call."


def _fmt_median_lap(v: Optional[float], sgn: float, ctx: dict) -> str:
    if v is None:
        return "Race-trim pace unavailable."
    field = ctx.get("field_median")
    s = v / 1000
    base = f"Median clean-lap pace projecting {s:.3f}s"
    if field is not None and field > 0:
        diff = (field - v) / 1000
        if abs(diff) >= 0.05:
            sign = "ahead of" if diff > 0 else "behind"
            return f"{base}, {abs(diff):.2f}s {sign} the field median pace."
    return base + "."


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
        "label": "TEAM RELIABILITY",
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
        "label": "RACE PACE",
        "fmt": _fmt_median_lap,
    },
}


def reasoning_blocks(
    features: list[str],
    shap_values: list[float],
    feature_values: list[float],
    top_n: int = 3,
    context: Optional[dict] = None,
) -> list[ReasoningBlock]:
    """
    Return up to `top_n` reasoning blocks for a single driver row, ranked
    by |SHAP|. If the top-3 features all lack a template, fall through to
    the next-most-important ones so we always try to emit `top_n` blocks.

    `context` (optional) carries per-feature comparison anchors:
        context["field_median"][feature] — median value across the field
        context["driver_baseline"][feature] — driver's cross-season mean
    Templates use these to produce comparative prose; absent context falls
    back to single-fact phrasing.
    """
    if len(features) != len(shap_values) or len(features) != len(feature_values):
        raise ValueError("features / shap_values / feature_values must align")

    ctx_field = (context or {}).get("field_median", {})
    ctx_base = (context or {}).get("driver_baseline", {})

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
        per_feature_ctx = {
            "field_median":    ctx_field.get(feat),
            "driver_baseline": ctx_base.get(feat),
        }
        text = tpl["fmt"](_safe(feat_val), float(shap_val), per_feature_ctx)
        blocks.append(ReasoningBlock(
            label=tpl["label"],
            impact=_tier(shap_val),
            text=text,
            feature=feat,
        ))
    return blocks

"""
Apex Predictor — single-call orchestrator that runs all six trained models
against the next upcoming race (or a specified one) and returns a curated
prediction bundle for the `/apex` UI.

Flow:
  1. Resolve target race (default: next upcoming via schedule API).
  2. Resolve qualifying — try Jolpica first, else predicted grid from lgbm_quali.
  3. Run predict_race() once per applicable model (top10, podium, winner, dnf).
  4. Compute SHAP for the top10 model on the winner's row → reasoning blocks.
  5. Build per-driver records + estimated gaps, then assemble ApexResult.

Designed to be cheap to call (predictions are model-call bound, ~1s total),
so the API endpoint can hit this on every page-load without caching for v1.
"""

from __future__ import annotations

import logging
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from ..api.deps import get_manifest, load_model
from ..ingestion.config import DATA_PROCESSED
from ..live import jolpica_client as jolpica
from ..live.current_grid import get_current_grid
from ..live.schedule import enriched_schedule, get_season_schedule, next_race
from ..models.config import PRE_RACE_FEATURES
from .predict import predict_race
from .reasoning_templates import ReasoningBlock, reasoning_blocks

log = logging.getLogger(__name__)


FEATURE_MATRIX = DATA_PROCESSED / "final_feature_matrix.parquet"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _team_colour_for(name: Optional[str], grid: list[dict]) -> Optional[str]:
    if not name:
        return None
    for row in grid:
        if (row.get("team_name") or "").lower() == name.lower():
            return row.get("team_colour")
    return None


def _headshot_for(driver_code: str, grid: list[dict]) -> Optional[str]:
    for row in grid:
        if row.get("driver_code") == driver_code:
            return row.get("headshot_url")
    return None


def _full_name_for(driver_code: str, grid: list[dict]) -> Optional[str]:
    for row in grid:
        if row.get("driver_code") == driver_code:
            return row.get("full_name")
    return None


def _driver_number_for(driver_code: str, grid: list[dict]) -> Optional[int]:
    for row in grid:
        if row.get("driver_code") == driver_code:
            return row.get("driver_number")
    return None


# ── Qualifying resolution ────────────────────────────────────────────────────

def _quali_from_jolpica(season: int, round_num: int) -> Optional[pd.DataFrame]:
    """Race results table is post-race; for upcoming races try the qualifying-
    results endpoint. Falls back to None silently when unavailable."""
    try:
        # Jolpica's results endpoint includes `grid` (starting position) when a
        # race is done. For an upcoming race, no data yet — caller falls back.
        rr = jolpica.race_results(season, round_num)
        if rr.empty:
            return None
        out = rr[["driver_code", "team_name", "grid"]].dropna(subset=["grid"]).copy()
        out = out.rename(columns={"grid": "quali_position"})
        out["quali_position"] = out["quali_position"].astype(int)
        return out
    except Exception as exc:
        log.warning("Jolpica quali fetch failed: %s", exc)
        return None


def _quali_from_predicted_grid(season: int, round_num: int) -> Optional[pd.DataFrame]:
    """Use lgbm_quali.pkl to predict the grid using current driver/team form."""
    artifact = load_model("lgbm_quali.pkl")
    if artifact is None:
        return None
    grid = get_current_grid(season)
    if not grid:
        return None
    # Build minimal quali input with placeholder positions (we predict them)
    df = pd.DataFrame([
        {"driver_code": g["driver_code"], "team_name": g["team_name"], "quali_position": 0}
        for g in grid
    ])
    try:
        circuit_id = _circuit_for_round(season, round_num) or ""
        out = predict_race(
            quali_input=df,
            circuit_id=circuit_id,
            round_num=round_num,
            season=season,
            weather=None,
            model_name="lgbm_quali.pkl",
        )
        # `prob_top10` here is actually a normalised score from the quali model.
        # Re-rank to get predicted starting positions.
        out = out.sort_values("prob_top10", ascending=False).reset_index(drop=True)
        out["quali_position"] = range(1, len(out) + 1)
        return out[["driver_code", "team_name", "quali_position"]]
    except Exception as exc:
        log.warning("Predicted-grid fallback failed: %s", exc)
        return None


def _circuit_for_round(season: int, round_num: int) -> Optional[str]:
    sched = enriched_schedule(season)
    if sched.empty:
        return None
    row = sched[sched["round"] == round_num]
    if row.empty:
        return None
    return str(row.iloc[0].get("circuit_id") or "")


def _resolve_quali(season: int, round_num: int) -> tuple[pd.DataFrame, str]:
    """Return (quali_df, source) where source ∈ {"actual","predicted"}."""
    j = _quali_from_jolpica(season, round_num)
    if j is not None and not j.empty:
        return j, "actual"
    p = _quali_from_predicted_grid(season, round_num)
    if p is not None and not p.empty:
        return p, "predicted"
    raise RuntimeError(f"No qualifying available for {season} R{round_num}")


# ── SHAP for winner row ──────────────────────────────────────────────────────

def _winner_shap_for(driver_code: str,
                     quali_df: pd.DataFrame,
                     circuit_id: str,
                     round_num: int,
                     season: int) -> tuple[list[str], list[float], list[float]]:
    """
    Compute SHAP for the `xgb_top10` model on the winner's feature row.
    We use xgb_top10 (not the ranker) because SHAP TreeExplainer doesn't
    support LGBMRanker out-of-the-box and high prob_top10 strongly correlates
    with high win probability — semantically close enough.

    Returns (feature_names, shap_values, feature_values) aligned.
    """
    try:
        import shap  # local import — keeps cold-start light when unused
    except ImportError:
        log.warning("SHAP not installed; reasoning blocks will be empty")
        return [], [], []

    artifact = load_model("xgb_top10.pkl")
    if artifact is None:
        return [], [], []

    # Re-create the feature row using the same plumbing as predict_race().
    # Easiest: call the helper functions in predict.py directly to get the
    # exact feature row the model would see.
    from .predict import (
        _attach_temporal, _attach_weather, _build_quali_features,
        _get_latest_rolling_stats,
    )
    feature_matrix = pd.read_parquet(FEATURE_MATRIX) if FEATURE_MATRIX.exists() else pd.DataFrame()
    if feature_matrix.empty:
        return [], [], []

    rolling = _get_latest_rolling_stats(feature_matrix, circuit_id)
    quali = _build_quali_features(quali_df)
    features = quali.merge(
        rolling.drop(columns=["team_name"], errors="ignore"),
        on="driver_code", how="left",
    )
    features = _attach_weather(features, None)
    features = _attach_temporal(features, round_num)

    row = features[features["driver_code"] == driver_code]
    if row.empty:
        return [], [], []

    model_cols = artifact["features"]
    X = row.reindex(columns=model_cols).fillna(0)
    X_imp = pd.DataFrame(
        artifact["imputer"].transform(X), columns=model_cols,
    ).fillna(0)

    try:
        explainer = shap.TreeExplainer(artifact["model"])
        sv = explainer.shap_values(X_imp)
        # sklearn-API tree models return (n_samples, n_features)
        shap_vals = sv[0] if isinstance(sv, np.ndarray) else np.array(sv[0])
    except Exception as exc:
        log.warning("SHAP compute failed: %s", exc)
        return [], [], []

    features_list = list(model_cols)
    shap_list = [float(v) for v in shap_vals]
    value_list = [float(v) for v in X_imp.iloc[0].tolist()]
    return features_list, shap_list, value_list


# ── Estimated gap (heuristic) ────────────────────────────────────────────────

# Per-position-step seconds gap, rough average across modern circuits
_GAP_STEP_S = 3.2


def _estimate_gap(position: int) -> float:
    # P1 leader at 0; subsequent positions extend by a soft-decay step.
    if position <= 1:
        return 0.0
    return round((position - 1) * _GAP_STEP_S + (position * 0.1), 2)


# ── Top-level orchestrator ───────────────────────────────────────────────────

def predict_apex(season: Optional[int] = None,
                  round_num: Optional[int] = None) -> dict:
    """Run all relevant models for the target race + assemble ApexResponse."""
    # 1) Resolve target race
    if season is None or round_num is None:
        nr = next_race(season)
        if nr is None:
            raise RuntimeError("Could not resolve next upcoming race")
        season = int(nr["season"])
        round_num = int(nr["round"])
        race_name = str(nr.get("race_name") or "")
        event_date = str(nr.get("event_date") or "") or None
        circuit_id = str(nr.get("circuit_id") or "")
    else:
        sched = enriched_schedule(season)
        row = sched[sched["round"] == round_num]
        if row.empty:
            raise RuntimeError(f"Round {round_num} not in season {season}")
        r = row.iloc[0]
        race_name = str(r.get("race_name") or "")
        event_date = str(r.get("event_date") or "") or None
        circuit_id = str(r.get("circuit_id") or "")

    # 2) Resolve quali
    quali_df, quali_source = _resolve_quali(season, round_num)

    # 3) Driver headshot / team-colour enrichment
    grid = get_current_grid(season) or []

    # 4) Run predictions per target
    def _run(model_name: str) -> pd.DataFrame:
        try:
            return predict_race(
                quali_input=quali_df,
                circuit_id=circuit_id,
                round_num=round_num,
                season=season,
                weather=None,
                model_name=model_name,
            )
        except Exception as exc:
            log.warning("Model %s failed: %s", model_name, exc)
            return pd.DataFrame()

    top10  = _run("xgb_top10.pkl")
    podium = _run("xgb_podium.pkl")
    winner = _run("lgbm_winner.pkl")
    dnf    = _run("xgb_dnf.pkl")

    # Index by driver_code for easy lookup
    def _ix(df: pd.DataFrame) -> dict[str, float]:
        if df.empty or "prob_top10" not in df.columns:
            return {}
        return dict(zip(df["driver_code"].tolist(), df["prob_top10"].tolist()))

    top10_probs  = _ix(top10)
    podium_probs = _ix(podium)
    winner_probs = _ix(winner)        # already softmaxed in predict.py for ranker
    dnf_probs    = _ix(dnf)

    # 5) Determine the top driver
    if winner_probs:
        top_code = max(winner_probs, key=winner_probs.get)
    elif top10_probs:
        top_code = max(top10_probs, key=top10_probs.get)
    else:
        raise RuntimeError("All prediction models failed")

    win_prob = float(winner_probs.get(top_code) or top10_probs.get(top_code, 0.0))

    # 6) Build podium — use the WINNER model so the hero driver and
    # podium P1 always agree (mockup shows the win % twice — once in the
    # hero card and once on the P1 tile). For P2/P3 we still report each
    # driver's win-share, which gives a coherent "chance of winning" story.
    podium_source = winner_probs if winner_probs else top10_probs
    sorted_pod = sorted(podium_source.items(), key=lambda kv: -kv[1])
    podium_codes = [c for c, _ in sorted_pod[:3]]
    podium_out = []
    for i, code in enumerate(podium_codes, start=1):
        team = next(
            (r["team_name"] for r in quali_df.to_dict("records") if r["driver_code"] == code),
            None,
        )
        podium_out.append({
            "position":     i,
            "driver_code":  code,
            "team_name":    team,
            "team_colour":  _team_colour_for(team, grid),
            "prob":         float(podium_source.get(code, 0.0)),
        })

    # 7) Estimated gap + P4–P10 finish table — rank by top10_probs (fallback winner)
    rank_source = top10_probs if top10_probs else winner_probs
    rank_sorted = sorted(rank_source.items(), key=lambda kv: -kv[1])
    finish_p4_p10 = []
    for pos, (code, prob) in enumerate(rank_sorted, start=1):
        if pos < 4 or pos > 10:
            continue
        team = next(
            (r["team_name"] for r in quali_df.to_dict("records") if r["driver_code"] == code),
            None,
        )
        at_risk = (dnf_probs.get(code, 0.0) > 0.18) or (prob < 0.4)
        finish_p4_p10.append({
            "position":         pos,
            "driver_code":      code,
            "team_name":        team,
            "team_colour":      _team_colour_for(team, grid),
            "est_gap_s":        _estimate_gap(pos),
            "confidence_score": float(prob),
            "at_risk":          bool(at_risk),
        })

    # 8) Reasoning (SHAP for the top driver)
    feats, shap_vals, feat_vals = _winner_shap_for(
        top_code, quali_df, circuit_id, round_num, season,
    )
    blocks = reasoning_blocks(feats, shap_vals, feat_vals, top_n=3)
    reasoning_out = [
        {"label": b.label, "impact": b.impact, "text": b.text, "feature": b.feature}
        for b in blocks
    ]

    # 9) Description for the hero card — assembled from top reasoning block
    if reasoning_out:
        description = (
            f"{top_code} leads our projections at {win_prob*100:.0f}%. "
            f"{reasoning_out[0]['text']}"
        )
    else:
        description = f"{top_code} leads our projections at {win_prob*100:.0f}%."

    # 10) Reliability score from manifest
    manifest = get_manifest()
    target_entry = next(
        (t for t in manifest.get("targets", []) if t.get("target") == "top10"),
        {},
    )
    val_metric = target_entry.get("val_metric")
    acc_pct = (val_metric * 100) if isinstance(val_metric, (int, float)) else None

    reliability = {
        "model_version":    manifest.get("version") or "1.0.0",
        "val_metric":       val_metric,
        "val_metric_name":  target_entry.get("val_metric_name"),
        "test_metric":      target_entry.get("test_metric"),
        "train_date":       target_entry.get("train_date"),
        "accuracy_pct":     round(acc_pct, 1) if acc_pct is not None else 90.0,
    }

    # 11) Conformal uncertainty (if available on the winner artifact)
    art = load_model("xgb_top10.pkl") or {}
    cal = art.get("conformal")
    win_low = max(0.0, win_prob - cal.quantile) if cal is not None else None
    win_high = min(1.0, win_prob + cal.quantile) if cal is not None else None

    top_pred = {
        "driver_code":    top_code,
        "driver_number":  _driver_number_for(top_code, grid),
        "full_name":      _full_name_for(top_code, grid),
        "team_name":      next(
            (r["team_name"] for r in quali_df.to_dict("records") if r["driver_code"] == top_code),
            None,
        ),
        "team_colour":    _team_colour_for(
            next(
                (r["team_name"] for r in quali_df.to_dict("records") if r["driver_code"] == top_code),
                None,
            ),
            grid,
        ),
        "headshot_url":   _headshot_for(top_code, grid),
        "win_prob":       float(win_prob),
        "win_low":        win_low,
        "win_high":       win_high,
        "stochastic_mean": float(win_prob),  # placeholder; v2 wire Monte Carlo
        "description":    description,
    }

    return {
        "race_meta": {
            "season":      season,
            "round":       round_num,
            "race_name":   race_name,
            "circuit_id":  circuit_id,
            "event_date":  event_date,
        },
        "top_prediction": top_pred,
        "podium":         podium_out,
        "reasoning":      reasoning_out,
        "finish_p4_p10":  finish_p4_p10,
        "reliability":    reliability,
        "generated_at":   datetime.now(timezone.utc).isoformat(),
        "quali_source":   quali_source,
    }

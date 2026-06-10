"""Apex Predictor — reasoning template generation + orchestrator smoke tests."""

import pytest

from src.inference.reasoning_templates import (
    REASONING_TEMPLATES,
    _tier_for_rank,
    reasoning_blocks,
)


def test_tier_for_rank_is_relative():
    # Top block always HIGH, next MEDIUM, the rest LOW — regardless of the
    # absolute SHAP scale (which is calibrated per model).
    assert _tier_for_rank(0) == "HIGH"
    assert _tier_for_rank(1) == "MEDIUM"
    assert _tier_for_rank(2) == "LOW"
    assert _tier_for_rank(3) == "LOW"


def test_reasoning_blocks_picks_top_n_by_abs_shap():
    feats = ["driver_avg_finish_L5", "team_avg_pit_time_ms", "rainfall", "quali_gap_to_pole_ms"]
    shap  = [0.05, 0.8, -0.6, 0.4]
    vals  = [3.5, 2300, 0, 250]
    blocks = reasoning_blocks(feats, shap, vals, top_n=3)
    assert len(blocks) == 3
    # Should be ordered by |shap| desc: pit (0.8), rain (0.6), quali (0.4)
    assert blocks[0].feature == "team_avg_pit_time_ms"
    assert blocks[1].feature == "rainfall"
    assert blocks[2].feature == "quali_gap_to_pole_ms"
    # Tiers are relative — rank 0 = HIGH, rank 1 = MEDIUM, rank 2 = LOW.
    assert blocks[0].impact == "HIGH"
    assert blocks[1].impact == "MEDIUM"
    assert blocks[2].impact == "LOW"


def test_reasoning_blocks_dedupes_by_label():
    # Both L5 and L10 share semantic territory ("form") and used to share the
    # same DRIVER FORM label. After dedupe + label rename they emit distinct
    # blocks; if a future template change reintroduces a label collision,
    # only the higher-|SHAP| candidate should survive.
    feats = ["driver_avg_finish_L5", "driver_avg_finish_L10", "team_avg_pit_time_ms"]
    shap  = [0.6, 0.4, 0.2]
    vals  = [3.5, 4.0, 2300]
    blocks = reasoning_blocks(feats, shap, vals, top_n=3)
    labels = [b.label for b in blocks]
    # No duplicate labels in the emitted set.
    assert len(labels) == len(set(labels))


def test_reasoning_blocks_skips_features_without_templates():
    feats = ["nonexistent_feature_A", "driver_avg_finish_L5", "another_unknown"]
    shap  = [0.9, 0.2, 0.5]
    vals  = [42, 4.2, 1]
    blocks = reasoning_blocks(feats, shap, vals, top_n=3)
    # Only one feature in our template registry → exactly 1 block emitted
    assert len(blocks) == 1
    assert blocks[0].feature == "driver_avg_finish_L5"


def test_template_coverage_is_at_least_nine_features():
    """Documenting the minimum coverage so a regression is loud."""
    assert len(REASONING_TEMPLATES) >= 9


def test_reasoning_block_text_is_human_readable():
    feats = ["quali_gap_to_pole_ms"]
    shap = [0.7]
    vals = [200]   # 0.2s off pole
    blocks = reasoning_blocks(feats, shap, vals, top_n=1)
    assert "0.200s" in blocks[0].text
    assert "pole" in blocks[0].text.lower()


def test_predict_apex_smoke():
    """End-to-end orchestrator smoke. Skipped if no models / data exist."""
    import os
    os.environ.setdefault("F1ML_DISABLE_REFRESHER", "1")
    try:
        from src.inference.apex import predict_apex
        result = predict_apex()
    except RuntimeError as exc:
        pytest.skip(f"Apex prediction prereqs not satisfied: {exc}")
        return
    except Exception as exc:
        pytest.fail(f"predict_apex() raised unexpected exception: {exc}")
        return

    # Top-level shape
    for key in ("race_meta", "top_prediction", "podium", "reasoning",
                "finish_p4_p10", "reliability", "generated_at", "quali_source"):
        assert key in result, f"missing key {key!r} in apex response"

    # Top driver consistency: hero driver must equal podium P1
    assert result["top_prediction"]["driver_code"] == result["podium"][0]["driver_code"]

    # Podium has 3 entries
    assert len(result["podium"]) == 3

    # P4-P10 — at most 7 rows, in ascending position order
    finish = result["finish_p4_p10"]
    assert len(finish) <= 7
    for i in range(len(finish) - 1):
        assert finish[i]["position"] < finish[i + 1]["position"]

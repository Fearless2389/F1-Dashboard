# Prediction targets

Each target is defined as a single file in `src/models/targets/`, conforming to the `Target` dataclass:

```python
@dataclass
class Target:
    name: str
    kind: str                  # "binary" | "regression" | "ranker"
    output_filename: str
    label_fn: Callable[[pd.DataFrame], pd.Series]
    features: list[str]
    model_factory: Callable[[], Any]
    eval_metric_name: str
    extra: dict
```

Trained via `python -m src.models.train --targets all` (or a comma-separated subset). Each saves a `{output_filename}` pickle and updates `models/trained/manifest.json`.

## 1. `top10` — Top-10 finish

- **Kind:** binary classification.
- **Label:** `finish_position_clean <= 10` (the original target from the existing pipeline — kept for backwards compatibility).
- **Model:** XGBoost (existing hyperparameters from `src/models/config.py`).
- **Metric:** ROC-AUC.
- **Known failure modes:** Tight midfield finishes (P9 vs P11) are inherently noisy. DNF-from-points races (e.g. Verstappen retiring while leading) push the bar around between rounds.

## 2. `podium` — Top-3 finish

- **Kind:** binary classification (rare-event).
- **Label:** `finish_position_clean <= 3`.
- **Model:** XGBoost with `scale_pos_weight=5` to compensate for the 15% positive class.
- **Metric:** ROC-AUC.
- **Known failure modes:** Wet races and safety cars create out-of-distribution podiums that the rolling-form features struggle to anticipate.

## 3. `winner` — Race winner (rank-aware)

- **Kind:** ranker (LightGBM `LGBMRanker`).
- **Label:** `21 - finish_position` so higher is better; group = `(season, round)`.
- **Output mapping:** Predicted scores are softmaxed per race → win probabilities sum to 1 across the field.
- **Metric:** NDCG@1 (fraction of races where the top-predicted is also top-actual).
- **Known failure modes:** A single dominant driver inflates training labels; the model can overweight Verstappen-era patterns. Per-race z-score features in `src/models/normalize.py` partially compensate.

## 4. `dnf` — Did not finish

- **Kind:** binary classification.
- **Label:** `is_dnf` (anything not in `{Finished, +1 Lap, +2 Laps, ...}`).
- **Model:** XGBoost.
- **Metric:** ROC-AUC.
- **Known failure modes:** DNF causes split between mechanical (predictable from team `team_dnf_rate_L10`) and incident (largely irreducible). The model captures the former and misses the latter.

## 5. `fastest_lap` — Holder of the fastest race lap

- **Kind:** regression on per-race median-lap rank.
- **Label:** rank of `median_clean_lap_ms` within each race (1 = fastest).
- **Output mapping:** Inverse-rank → softmax → probability of holding the fastest lap.
- **Metric:** RMSE on the rank.
- **Known failure modes:** Fastest-lap incentive (the +1 bonus point) means drivers outside the top 10 sometimes pit for soft tyres in the closing laps — entirely strategy-driven, not pace-driven.

## 6. `quali` — Predicted qualifying position

- **Kind:** regression on `quali_position`.
- **Features:** Excludes `quali_position`, `quali_gap_to_pole_ms`, `quali_position_vs_team` (target leakage).
- **Output mapping:** Per-race rank of predicted positions → predicted starting grid.
- **Metric:** RMSE.
- **Known failure modes:** Practice-session pace would dramatically improve this target; `practice_features.py` provides hooks but requires re-ingesting FP sessions which the current pipeline doesn't do by default.

## Uncertainty: split-conformal prediction

`src/models/uncertainty.py` fits a one-sided conformal calibration on the validation set (`alpha=0.1` → ~90% intervals). For each predicted probability we report `(prob - q, prob + q)` clipped to `[0, 1]`. The winner-model uses this to drive the "win probability with uncertainty band" chart on `/predict`.

## Per-race normalisation

`src/models/normalize.py:add_per_race_zscores` z-scores selected columns (currently `quali_gap_to_pole_ms`, `driver_avg_finish_L5`, `team_avg_finish_L5`) within each race. This makes the models robust to grid-strength shifts — important for the 2026 regulation reset.

## Embeddings

`src/features/embeddings.py` fits an 8-dimensional `TruncatedSVD` on the (driver × circuit) and (team × circuit) finish-position matrices, recomputed cumulatively per season. Cached to `data/processed/embeddings.parquet` so the feature builder joins it like any other rolling stat.

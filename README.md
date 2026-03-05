# F1 2026 Race Outcome Prediction System

A production-style machine learning pipeline that predicts the probability of each driver finishing in the top 10 for Formula 1 races, built on FastF1 telemetry data and XGBoost.

## Overview

- **Target**: Binary classification — top-10 finish (1) or not (0)
- **Training data**: 2018–2023 seasons
- **Validation**: 2024 season
- **Test**: 2025 season
- **Prediction target**: 2026 races
- **Model**: XGBoost with 27 engineered features + Logistic Regression baseline

## Architecture

```
FastF1 API
    │
    ▼
┌─────────────────────────────┐
│  Phase 1 — Data Ingestion   │  fetch_sessions.py, fetch_laps.py
│  race results, qualifying,  │
│  lap data, weather          │
└──────────────┬──────────────┘
               │ data/raw/*.parquet
               ▼
┌─────────────────────────────┐
│  Phase 2 — Cleaning         │  align.py
│  DNF flags, position fill,  │
│  quali gap, join on         │
│  (season, round, driver)    │
└──────────────┬──────────────┘
               │ aligned_race_dataset.parquet
               ▼
┌─────────────────────────────┐
│  Phase 3 — Feature Eng.     │  driver/team/pace/strategy features
│  27 features, rolling       │
│  windows, no leakage        │
└──────────────┬──────────────┘
               │ final_feature_matrix.parquet
               ▼
┌─────────────────────────────┐
│  Phase 4 — Model Training   │  train.py
│  Baseline + XGBoost         │
│  time-aware splits          │
└──────────────┬──────────────┘
               │ models/trained/*.pkl
               ▼
┌─────────────────────────────┐
│  Phase 5 — Evaluation       │  analysis.py
│  SHAP, calibration,         │
│  error breakdown            │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  Phase 6 — Inference        │  predict.py
│  2026 qualifying → probs    │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  Phase 7 — Dashboard        │  app.py (Streamlit)
│  dark F1 UI, SHAP viewer    │
└─────────────────────────────┘
```

## Tech Stack

| Category | Library |
|---|---|
| F1 data | `fastf1` |
| Data processing | `pandas`, `numpy`, `pyarrow` |
| ML | `scikit-learn`, `xgboost` |
| Explainability | `shap` |
| Visualisation | `matplotlib` |
| Dashboard | `streamlit` |
| Pipeline | Python stdlib |

## Setup

```bash
# 1. Clone
git clone https://github.com/Fearless2389/f1-ml.git
cd f1-ml

# 2. Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r requirements.txt
```

## Quick Start — Full Pipeline

Run everything in one command (takes time on first run — FastF1 downloads ~2–5 GB):

```bash
# All seasons 2018–2025 (full training run)
python run_pipeline.py

# Single season (fast — good for testing)
python run_pipeline.py --seasons 2023 --skip-analysis

# Skip data fetch if already downloaded
python run_pipeline.py --skip-fetch
```

## Step-by-Step Pipeline

```bash
# Phase 1 — Fetch session data (race results, qualifying, weather)
python -m src.ingestion.fetch_sessions --resume

# Phase 1 — Fetch lap data (pace, strategy features)
python -m src.ingestion.fetch_laps --resume

# Phase 2 — Clean and align datasets
python -m src.cleaning.align

# Phase 3 — Build feature matrix (27 features)
python -m src.features.build_features

# Phase 4 — Train models
python -m src.models.train                    # baseline + XGBoost
python -m src.models.train --model xgb        # XGBoost only

# Phase 5 — Error analysis + SHAP
python -m src.models.analysis                 # val set (2024)
python -m src.models.analysis --split test    # test set (2025)
python -m src.models.analysis --no-shap       # skip SHAP (faster)
```

## Running the Dashboard

```bash
streamlit run src/dashboard/app.py
```

Opens at `http://localhost:8501`. Three tabs:
- **Predict** — upload qualifying CSV → ranked probability table + bar chart
- **Driver Insight** — rolling form chart, per-driver SHAP contributions
- **Model Info** — metrics, calibration curve, feature importance

## Making 2026 Predictions

```bash
# Using the sample Bahrain 2026 qualifying
python -m src.inference.predict \
  --input examples/sample_quali_2026_bahrain.csv \
  --circuit "Bahrain International Circuit" \
  --round 1 \
  --season 2026 \
  --output data/processed/bahrain_2026_predictions.csv

# Wet race
python -m src.inference.predict \
  --input examples/sample_quali_2026_bahrain.csv \
  --circuit "Bahrain International Circuit" \
  --round 1 \
  --rain
```

### Input CSV format

```
driver_code,team_name,quali_position,q1_time_ms,q2_time_ms,q3_time_ms
VER,Red Bull Racing,1,88234,87891,87543
NOR,McLaren,2,88312,88021,87698
...
```

See `examples/sample_quali_2026_bahrain.csv` for the full template.

## Project Structure

```
f1-ml/
├── run_pipeline.py              # End-to-end pipeline runner
├── requirements.txt
├── .gitignore
│
├── src/
│   ├── ingestion/
│   │   ├── config.py            # Paths, seasons, constants
│   │   ├── fetch_sessions.py    # Race results, qualifying, weather
│   │   └── fetch_laps.py        # Lap-level data
│   ├── cleaning/
│   │   └── align.py             # Join + DNF flagging + target var
│   ├── features/
│   │   ├── driver_features.py   # Rolling driver stats (L5/L10)
│   │   ├── team_features.py     # Team rolling stats + pit times
│   │   ├── pace_features.py     # Lap pace, degradation, strategy
│   │   └── build_features.py    # Orchestrator → feature matrix
│   ├── models/
│   │   ├── config.py            # Feature lists, hyperparameters
│   │   ├── train.py             # Baseline + XGBoost training
│   │   ├── evaluate.py          # ROC-AUC, Brier, Precision@10
│   │   └── analysis.py          # SHAP, calibration, error breakdown
│   ├── inference/
│   │   └── predict.py           # 2026 race prediction engine
│   └── dashboard/
│       └── app.py               # Streamlit UI
│
├── data/
│   ├── raw/                     # Parquet files (gitignored)
│   ├── processed/               # Feature matrix (gitignored)
│   └── cache/                   # FastF1 cache (gitignored)
│
├── models/
│   └── trained/                 # Saved .pkl artifacts (gitignored)
│
├── examples/
│   └── sample_quali_2026_bahrain.csv
│
└── docs/
    ├── feature_schema.md        # Full feature definitions + dtypes
    └── analysis/                # SHAP plots, calibration curves
```

## Feature Engineering

27 features across 6 categories (see `docs/feature_schema.md` for full schema):

| Category | Features | Note |
|---|---|---|
| Qualifying | `quali_position`, `quali_gap_to_pole_ms`, `quali_position_vs_team` | Pre-race |
| Driver form | `driver_avg_finish_L5/L10`, `driver_dnf_rate_L10`, `driver_points_L5`, `driver_experience`, `driver_circuit_avg_finish` | Rolling, no leakage |
| Team | `team_avg_finish_L5`, `team_dnf_rate_L10`, `team_points_L5`, `team_avg_pit_time_ms` | Rolling |
| Pace | `median_clean_lap_ms`, `lap_time_vs_field_pct`, `sector_consistency`, `deg_slope` | In-race only |
| Strategy | `starting_compound_enc`, `num_stints`, `num_pit_stops` | In-race only |
| Context | `air_temp_mean`, `track_temp_mean`, `rainfall`, `round_number`, `season_stage` | Pre-race |

> **In-race features** are used during training only. The inference pipeline substitutes historical averages for pre-race prediction.

## Validation Results

Fill in after running the full pipeline:

| Split | Seasons | ROC-AUC | Brier | Precision@10 |
|---|---|---|---|---|
| Train | 2018–2023 | — | — | — |
| Val | 2024 | — | — | — |
| Test | 2025 | — | — | — |

## Limitations

- **In-race leakage in training**: Pace and strategy features use data from the race being predicted. This improves training metrics but means the model sees the outcome's context. The inference pipeline avoids this by using only pre-race features.
- **Driver transfers**: Rolling stats carry over between teams. A driver's team form from their previous constructor affects their first race at a new team.
- **2026 regulation changes**: The 2026 F1 season has major regulation changes (new power unit formula). Team and driver performance baselines from 2018–2025 may not generalise as well to 2026.
- **Safety cars / red flags**: Race outcomes affected by safety car periods are harder to predict and contribute to false positives.

## Roadmap (Phase 8)

Future enhancements planned:
- **Monte Carlo race simulator** — 1000-run simulation with DNF sampling
- **Learning-to-Rank (LambdaMART)** — full race order prediction
- **Bayesian uncertainty intervals** — confidence bounds on probabilities
- **Drift monitoring** — track model performance degradation across seasons

<!--
  YAML frontmatter below is required by Hugging Face Spaces — it declares
  the SDK, display metadata, and license for the deployed Space. Removing
  it will cause the Space to fail to build. The actual project README
  starts below the second `---`.
-->
---
title: Race Replay
emoji: 🏎️
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 8000
pinned: false
license: mit
---

# F1 ML — Live predictions, race tracking, and analytics

An interactive Formula 1 analytics platform built on the existing FastF1 ingestion + multi-target ML pipeline, with a React dashboard for live race tracking, predictions, and historical exploration.

## What's new in this rebuild

| Area | Before | Now |
|---|---|---|
| Frontend | Streamlit, static matplotlib | **React + Vite + Tailwind v4 + shadcn-style components**, Recharts, Framer Motion |
| Live updates | None | **WebSocket** stream from OpenF1 → animated track map + telemetry |
| Predictions | Top-10 only | **Top-10, podium, winner (rank-aware), DNF, fastest lap, qualifying** |
| Backend | Direct Python imports inside Streamlit | **FastAPI** REST + WebSocket API |
| Race calendar | None | Schedule + countdown + 3-day weather forecast per circuit |
| Uncertainty | None | Split-conformal intervals on the winner model |
| Simulation | None | Monte Carlo race simulator (Plackett-Luce + DNF sampling) |
| Driver / team features | 27 base features | + practice pace, per-race z-scores, SVD embeddings |

## Architecture

```
                 ┌──────────────────┐
                 │  React frontend  │  Vite + TS + Tailwind v4 + Recharts/Visx
                 │  web/            │  Routes: live · calendar · predict · explore · driver · model
                 └────────┬─────────┘
                          │ REST + WebSocket
                          ▼
                 ┌──────────────────┐
                 │  FastAPI         │  src/api/
                 │  + APScheduler   │  routers · schemas · websocket
                 └────────┬─────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌──────────────────┐
│ Live data     │ │ ML pipeline   │ │ Historical store │
│ src/live/     │ │ src/models/   │ │ data/processed/  │
│ OpenF1 client │ │ targets/      │ │ feature matrix   │
│ Schedule      │ │ uncertainty   │ │ parquets         │
│ Open-Meteo    │ │ simulator     │ └──────────────────┘
└───────────────┘ └───────────────┘
```

External data: [FastF1](https://docs.fastf1.dev/) (historical), [OpenF1](https://openf1.org/) (live), [Open-Meteo](https://open-meteo.com/) (weather).

## Setup

```bash
# 1. Python deps
python -m venv venv
source venv/bin/activate          # macOS/Linux
venv\Scripts\activate             # Windows
pip install -r requirements.txt

# 2. JS deps
cd web
pnpm install                      # or npm install
cd ..
```

## Quick start (local dev)

You need **two terminals**:

```bash
# Terminal 1 — FastAPI backend on :8000
uvicorn src.api.main:app --reload --port 8000

# Terminal 2 — Vite dev server on :5173 (proxies /api/* to :8000)
cd web && pnpm dev
```

Then open `http://localhost:5173`.

Windows users: `scripts/dev.ps1` launches both at once.

### Without the live refresher

The FastAPI app starts an APScheduler thread that polls OpenF1 every 5s. To skip that (e.g. for offline dev or unit tests):

```bash
$env:F1ML_DISABLE_REFRESHER = "1"          # PowerShell
export F1ML_DISABLE_REFRESHER=1            # bash
uvicorn src.api.main:app --reload
```

## Training & data

```bash
# 1. Fetch sessions + laps (skip if already done)
python -m src.ingestion.fetch_sessions --resume
python -m src.ingestion.fetch_laps --resume

# 2. Clean + align
python -m src.cleaning.align

# 3. Feature matrix (now includes embeddings + per-race z-scores)
python -m src.features.build_features

# 4. Train all six targets at once
python -m src.models.train --targets all

# Just a few targets
python -m src.models.train --targets top10,podium,winner

# Refresh the live snapshot once (no scheduler)
python -m src.live.refresher --once
```

After training, `models/trained/manifest.json` is regenerated and surfaced via `/api/models`.

## The six prediction targets

Defined in `src/models/targets/`. Each target is a single file conforming to the `Target` dataclass.

| Target       | Kind        | Model                | Label                                   | Output file              |
|--------------|-------------|----------------------|-----------------------------------------|--------------------------|
| `top10`      | binary      | XGBClassifier        | `finish_position <= 10`                 | `xgb_top10.pkl`          |
| `podium`     | binary      | XGBClassifier (boosted positive weight) | `finish_position <= 3`     | `xgb_podium.pkl`         |
| `winner`     | ranker      | LGBMRanker (group = race) | `21 - finish_position`             | `lgbm_winner.pkl`        |
| `dnf`        | binary      | XGBClassifier        | `is_dnf`                                | `xgb_dnf.pkl`            |
| `fastest_lap`| regression  | LGBMRegressor        | per-race median-lap rank                | `lgbm_fastest_lap.pkl`   |
| `quali`      | regression  | LGBMRegressor (no quali leakage) | `quali_position` (regressed)      | `lgbm_quali.pkl`         |

The `predict_race` function in `src/inference/predict.py` branches on `artifact["kind"]` so all targets share one call path. Multi-target predictions are returned in a single response from `POST /api/predict`.

Monte Carlo race simulation runs in `src/inference/simulator.py` — sample DNFs from per-driver `prob_dnf`, sample finish order via Plackett-Luce on `prob_win`, sample fastest-lap holder weighted by `prob_fastest_lap`. Returns win/podium distributions, expected points, and top podium combinations.

## React frontend routes

| Route | What it shows |
|---|---|
| `/live` | WebSocket-driven timing tower, animated track map, telemetry overlay, race-control feed |
| `/calendar` | Season calendar with countdown timers, weather forecasts, circuit metadata |
| `/predict` | Run multi-target predictions; tabs per target; Monte Carlo podium combinations |
| `/explore` | Driver-vs-driver comparison across seasons |
| `/driver/:code` | Driver profile + rolling form |
| `/model` | Manifest of trained models + per-target feature importance |

Charts are Recharts (SVG, hover/zoom out of the box). Track map is a hand-rolled SVG that can be replaced with circuit-specific outlines from `web/public/circuits/{id}.svg` later.

## API surface

`uvicorn src.api.main:app` exposes the OpenAPI schema at `/docs`. Key endpoints:

```
GET    /api/health                          status + refresher state
GET    /api/schedule/{year}                 enriched season schedule
GET    /api/schedule/{year}/{round}         single race + weather
GET    /api/schedule/circuits/all           circuit metadata
GET    /api/live/snapshot                   last cached live snapshot
WS     /api/live/stream                     pushes snapshots as they come in
GET    /api/live/telemetry                  raw car_data for a driver
GET    /api/drivers                         all known driver codes
GET    /api/drivers/{code}                  profile + rolling stats
GET    /api/teams                           all team names
GET    /api/teams/{name}/trend              points per round
GET    /api/compare?drivers=VER,LEC         multi-driver comparison
POST   /api/predict                         multi-target prediction
POST   /api/predict/simulate                Monte Carlo run
GET    /api/models                          manifest of trained models
GET    /api/models/{target}/importance      feature importance for a target
```

Regenerate TypeScript types from the live OpenAPI schema:

```bash
cd web
pnpm types:gen        # writes src/lib/types.gen.ts
```

## Tests

```bash
# Python
pytest tests/

# Frontend (scaffold ready — wire Vitest in web/package.json when adding tests)
cd web && pnpm lint
```

## Deployment

See [`docs/deployment.md`](docs/deployment.md). Short version:

- **Frontend → Vercel** (Vite preset, root `web/`)
- **Backend → Railway** (Nixpacks auto-detects Python; one-line `Procfile` runs `uvicorn`)
- **No Docker required** — neither host needs it.

## Roadmap (v2, after the rehaul ships)

- LLM race recap generator (post-race summaries on `/calendar`)
- Race replay scrubber (`/live` timeline drags through any completed race)
- Causal driver-vs-car decomposition ("What if Hamilton drove a Red Bull?")

See the full optional menu in [`docs/v2-roadmap.md`](docs/v2-roadmap.md) (Phase 8 of the rebuild plan).

## Project structure

```
F1 ML/
├── run_pipeline.py
├── requirements.txt           # +fastapi, +httpx, +apscheduler
├── pytest.ini
├── Procfile                   # Railway / Heroku-compatible
├── runtime.txt
│
├── src/
│   ├── ingestion/             # Existing FastF1 ingestion
│   ├── cleaning/              # align.py
│   ├── features/              # + embeddings.py, practice_features.py
│   ├── models/                # + targets/, normalize.py, uncertainty.py
│   │   └── targets/           # top10, podium, winner_ranker, dnf, fastest_lap, quali
│   ├── inference/             # + simulator.py
│   ├── live/                  # OpenF1 client, schedule, weather, refresher
│   ├── api/                   # FastAPI app + routers + schemas + websocket
│   └── dashboard/             # Legacy Streamlit dashboard (kept until React parity confirmed)
│
├── web/                       # React frontend
│   ├── src/
│   │   ├── routes/            # Live · Calendar · Predict · Explore · Driver · Model
│   │   ├── components/        # ui/ · panels/ · Shell
│   │   ├── hooks/             # useApi, useLiveSocket
│   │   ├── lib/               # api, types, teams, cn
│   │   └── store/             # raceContext (zustand)
│   └── public/
│
├── data/
│   ├── raw/  processed/  cache/
│   ├── live/                  # Refresher writes current_session.json here
│   └── schedule/              # Schedule parquets + circuits.csv
│
├── models/trained/            # Pickles + manifest.json
├── tests/                     # pytest tests for simulator, targets, uncertainty, API smoke
└── docs/
```

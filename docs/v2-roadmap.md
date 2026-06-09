# v2 roadmap

These items are deferred until after the React + FastAPI rehaul is shipped and validated. Treat this as a menu — pick items individually, not as a single project.

## Starter pack (the three to do first)

1. **LLM race recap generator** — after each race, a 200-word recap from prediction post-mortem + key event log. Surfaced on `/calendar` past-race cards.
2. **Race replay scrubber** — timeline at the bottom of `/live` that drags through any completed race, animating the track map + telemetry + standings as you scrub.
3. **Causal driver-vs-car decomposition** — DoubleML / structural model to separate driver skill from car quality. Outputs counterfactuals like "What would Hamilton's 2024 look like in a Red Bull?"

## Advanced ML

- Sequence models on lap-by-lap data (Transformer encoder)
- Graph Neural Net for driver-vs-driver interactions
- RL strategy agent (optimal pit windows)
- Bayesian race model (PyMC / NumPyro full posteriors)
- Active learning loop for high-variance race weekends
- Multi-task neural net (share trunk across the 6 targets)
- Per-lap live re-prediction model

## Richer data sources

- Whisper-transcribed team radio
- Reddit / Twitter sentiment per driver/team (48h pre-race)
- Betting market odds (edge detection)
- Historical archive back to 1950 (Ergast → Jolpica)
- F2 / F3 / FRECA results (rookie projection)
- FIA technical directives (light NLP)
- Engine penalty tracker
- Driver biometric data

## UX & engagement

- 3D track view (Three.js) toggle on `/live`
- Fantasy F1 optimizer (integer programming)
- Browser extension overlay during F1 TV broadcasts
- Mobile companion app (React Native sharing the API)
- Voice queries (small LLM → route + state)
- Social leaderboard (user predictions vs model)
- Race-vs-race overlay (any two historical races at the same circuit)
- Annotated lap-by-lap community journal

## Infrastructure maturity

- PostgreSQL + Timescale (or DuckDB) replacing parquet-only
- ClickHouse for telemetry (millions of rows / race)
- Redis for live state across replicas
- MLflow for experiment tracking
- Feast (or similar) for feature store
- Model regression CI on a frozen 2025 holdout
- Multi-user accounts (Clerk / Supabase Auth)
- OpenTelemetry + Grafana for observability

## Novel use cases

- Constructor championship Monte Carlo simulator
- Driver-market mid-season swap predictor
- Steward decision predictor (penalty severity)
- Rookie comparison tool (trajectory matcher)
- "What-if" history rewriter
- Tyre wear visualizer (cliff lap per compound)
- Broadcast-graphic export (shareable PNG/MP4)
- F1 strategy quiz / training mode

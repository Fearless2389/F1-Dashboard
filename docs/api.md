# API reference

OpenAPI schema served at `http://localhost:8000/docs`. Highlights below — see `src/api/schemas/` for the full Pydantic models.

## Health & meta

```
GET /api/health      → { "status": "ok", "refresher_running": true }
GET /api/version     → { "api_version": "1.0.0", "python": "...", "fastf1": "..." }
```

## Schedule

```
GET /api/schedule/2026                     # all events
GET /api/schedule/2026?include_weather=1   # + 3-day weather forecasts
GET /api/schedule/2026/1                   # single round + circuit metadata
GET /api/schedule/circuits/all             # static metadata
```

Example response (`/api/schedule/2026/1?include_weather=true`):

```json
{
  "season": 2026, "round": 1,
  "race_name": "Bahrain Grand Prix",
  "country": "Bahrain", "location": "Sakhir", "circuit_id": "bahrain",
  "event_date": "2026-03-15T15:00:00Z",
  "circuit_meta": {
    "circuit_id": "bahrain", "lap_length_km": 5.412,
    "downforce_level": "medium", "overtake_difficulty": 2
  },
  "weather_forecast": {
    "air_temp_mean": 28.4, "rain_probability_max": 5.0,
    "wind_speed_mean": 12.1, "wet_race_likely": false
  }
}
```

## Live

```
GET  /api/live/snapshot                                 # last cached snapshot
GET  /api/live/telemetry?session_key=X&driver_number=Y
WS   /api/live/stream                                   # push snapshots
```

WebSocket protocol: client sends `"ping"`, server replies `{"type":"pong"}`. Server pushes the full `LiveSnapshot` JSON every refresh (~5s while a session is active).

## Historical

```
GET /api/drivers                              # all known driver codes
GET /api/drivers/VER                          # profile + timeline
GET /api/teams                                # all team names
GET /api/teams/Ferrari/trend                  # points per round
GET /api/compare?drivers=VER,LEC&from_season=2022&to_season=2025
GET /api/circuits/bahrain/history
```

## Predictions

```
POST /api/predict
```

Request:

```json
{
  "season": 2026,
  "round": 1,
  "circuit_id": "bahrain",
  "weather": { "air_temp_mean": 28, "track_temp_mean": 40, "rainfall": false },
  "targets": ["top10", "podium", "winner", "dnf", "fastest_lap"],
  "quali": [
    { "driver_code": "VER", "team_name": "Red Bull Racing", "quali_position": 1 },
    { "driver_code": "LEC", "team_name": "Ferrari",          "quali_position": 2 },
    { "driver_code": "NOR", "team_name": "McLaren",          "quali_position": 3 }
  ]
}
```

Response: `PredictionResponse` with one `DriverPrediction` per driver, each containing the requested `prob_*` fields and (for the winner model) `win_low` / `win_high` conformal bands. Plus `podium_combinations` (top-5 trios by joint probability).

```
POST /api/predict/simulate
```

Same body as `/api/predict` plus `n_iterations` (default 1000). Returns:

```json
{
  "season": 2026, "round": 1, "n_iterations": 1000,
  "win_distribution":    { "VER": 0.42, "LEC": 0.18, ... },
  "podium_distribution": { "VER": 0.78, "LEC": 0.55, ... },
  "expected_points":     { "VER": 19.4, "LEC": 14.2, ... },
  "podium_combinations": [{ "drivers": ["VER","LEC","NOR"], "probability": 0.16 }, ...]
}
```

## Models

```
GET /api/models                          # manifest with metrics + train dates
GET /api/models/top10/importance         # top-15 features by gain
GET /api/models/top10/calibration        # reliability bins (binary targets only)
```

## CORS

Allowed origins:
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `${FRONTEND_ORIGIN}` env var (set this on Railway for the Vercel URL)

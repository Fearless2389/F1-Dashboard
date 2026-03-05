# Feature Schema — F1 2026 Top-10 Prediction System

## Target Variable

| Column | Dtype | Description |
|---|---|---|
| `top_10` | `int8` | 1 if finishing_position <= 10, else 0 |

---

## Row Key (Index Columns)

Each row = one driver in one race.

| Column | Dtype | Source | Description |
|---|---|---|---|
| `season` | `int16` | FastF1 session | Year (2018–2026) |
| `round` | `int8` | FastF1 session | Round number within season |
| `race_name` | `str` | FastF1 session | e.g. "British Grand Prix" |
| `circuit_id` | `str` | FastF1 session | e.g. "silverstone" |
| `driver_code` | `str` | FastF1 results | 3-letter code e.g. "VER" |
| `driver_number` | `int8` | FastF1 results | Car number |
| `team_name` | `str` | FastF1 results | Constructor name |

---

## Phase 1 Output — Raw Fields (data/raw/)

These are extracted directly from FastF1. No transformation.

### race_results.parquet

| Column | Dtype | FastF1 Field | Description |
|---|---|---|---|
| `season` | `int16` | session.event.year | Race year |
| `round` | `int8` | session.event.RoundNumber | Round number |
| `circuit_id` | `str` | session.event.Location | Circuit location |
| `driver_code` | `str` | results.Abbreviation | 3-letter driver code |
| `driver_number` | `int8` | results.DriverNumber | Car number |
| `team_name` | `str` | results.TeamName | Constructor |
| `grid_position` | `int8` | results.GridPosition | Starting grid position |
| `finish_position` | `float32` | results.Position | Finishing position (NaN = DNF) |
| `finish_status` | `str` | results.Status | e.g. "Finished", "Accident" |
| `points` | `float32` | results.Points | Points scored |
| `laps_completed` | `int16` | results.LapsCompleted | Number of laps completed |
| `race_time_ms` | `float64` | results.Time | Total race time in ms |

### qualifying_results.parquet

| Column | Dtype | FastF1 Field | Description |
|---|---|---|---|
| `season` | `int16` | session.event.year | Race year |
| `round` | `int8` | session.event.RoundNumber | Round number |
| `driver_code` | `str` | results.Abbreviation | 3-letter driver code |
| `team_name` | `str` | results.TeamName | Constructor |
| `q1_time_ms` | `float64` | results.Q1 | Q1 lap time in ms |
| `q2_time_ms` | `float64` | results.Q2 | Q2 lap time in ms (NaN if not reached) |
| `q3_time_ms` | `float64` | results.Q3 | Q3 lap time in ms (NaN if not reached) |
| `quali_position` | `int8` | results.Position | Final qualifying position |

### lap_data.parquet

| Column | Dtype | FastF1 Field | Description |
|---|---|---|---|
| `season` | `int16` | session.event.year | Race year |
| `round` | `int8` | session.event.RoundNumber | Round number |
| `driver_code` | `str` | laps.Driver | 3-letter driver code |
| `lap_number` | `int16` | laps.LapNumber | Lap number |
| `lap_time_ms` | `float64` | laps.LapTime | Lap time in ms |
| `sector1_ms` | `float64` | laps.Sector1Time | Sector 1 time in ms |
| `sector2_ms` | `float64` | laps.Sector2Time | Sector 2 time in ms |
| `sector3_ms` | `float64` | laps.Sector3Time | Sector 3 time in ms |
| `compound` | `str` | laps.Compound | Tyre compound e.g. "SOFT" |
| `tyre_life` | `int8` | laps.TyreLife | Laps on current tyre |
| `stint` | `int8` | laps.Stint | Stint number |
| `pit_in_time` | `float64` | laps.PitInTime | Pit entry time (NaN if no pit) |
| `pit_out_time` | `float64` | laps.PitOutTime | Pit exit time (NaN if no pit) |
| `is_accurate` | `bool` | laps.IsAccurate | FastF1 accuracy flag |
| `track_status` | `str` | laps.TrackStatus | e.g. "1"=clear, "4"=SC, "6"=VSC |

### weather_data.parquet

| Column | Dtype | FastF1 Field | Description |
|---|---|---|---|
| `season` | `int16` | session.event.year | Race year |
| `round` | `int8` | session.event.RoundNumber | Round number |
| `air_temp_mean` | `float32` | weather.AirTemp.mean() | Mean air temperature (°C) |
| `track_temp_mean` | `float32` | weather.TrackTemp.mean() | Mean track temperature (°C) |
| `humidity_mean` | `float32` | weather.Humidity.mean() | Mean humidity (%) |
| `wind_speed_mean` | `float32` | weather.WindSpeed.mean() | Mean wind speed (m/s) |
| `rainfall` | `bool` | weather.Rainfall.any() | True if any rain during session |

---

## Phase 2 Output — Aligned Dataset (data/processed/)

### aligned_race_dataset.parquet

All Phase 1 raw fields joined on `(season, round, driver_code)`, plus:

| Column | Dtype | Transformation | Description |
|---|---|---|---|
| `is_dnf` | `int8` | `finish_status != "Finished"` → 1 | DNF flag |
| `finish_position_clean` | `float32` | DNFs assigned position 20 | Position with DNFs filled |
| `best_quali_time_ms` | `float64` | `min(q1, q2, q3)` | Best qualifying time across segments |
| `quali_gap_to_pole_ms` | `float64` | `best_quali_time - pole_time` | Gap to pole in ms |

---

## Phase 3 Output — Feature Matrix (data/processed/)

### final_feature_matrix.parquet

Target + all engineered features. One row per (season, round, driver).

#### Driver Form Features

| Column | Dtype | Window | Description |
|---|---|---|---|
| `driver_avg_finish_L5` | `float32` | Last 5 races | Rolling avg finishing position |
| `driver_avg_finish_L10` | `float32` | Last 10 races | Rolling avg finishing position |
| `driver_dnf_rate_L10` | `float32` | Last 10 races | DNF rate (0.0–1.0) |
| `driver_points_L5` | `float32` | Last 5 races | Rolling points total |
| `driver_circuit_avg_finish` | `float32` | All prior visits | Avg finish at this specific circuit |
| `driver_experience` | `int16` | Career to date | Total race starts before this race |

#### Qualifying Features

| Column | Dtype | Transformation | Description |
|---|---|---|---|
| `quali_position` | `int8` | Direct from raw | Final qualifying position (1–20) |
| `quali_gap_to_pole_pct` | `float32` | `gap_ms / pole_ms * 100` | % gap to pole (normalised across circuits) |
| `quali_position_vs_team` | `int8` | `quali_pos - teammate_quali_pos` | Intra-team qualifying delta |

#### Team Features

| Column | Dtype | Window | Description |
|---|---|---|---|
| `team_avg_finish_L5` | `float32` | Last 5 races | Constructor rolling avg finish |
| `team_dnf_rate_L10` | `float32` | Last 10 races | Constructor DNF rate |
| `team_avg_pit_time_ms` | `float64` | Season to date | Mean pit stop duration |
| `team_points_L5` | `float32` | Last 5 races | Constructor rolling points |

#### Pace Features (from lap_data)

| Column | Dtype | Filter | Description |
|---|---|---|---|
| `median_clean_lap_ms` | `float64` | `is_accurate=True, track_status="1"` | Median clean air lap time |
| `lap_time_vs_field_pct` | `float32` | Normalised by race median | % above/below field median lap time |
| `deg_slope` | `float32` | Linear fit over stint | Lap time degradation per lap (ms/lap) |
| `sector_consistency` | `float32` | Std dev of sector times | Lower = more consistent |

#### Strategy Features

| Column | Dtype | Source | Description |
|---|---|---|---|
| `starting_compound` | `str` | lap_data stint 1 | Tyre compound at race start |
| `starting_compound_enc` | `int8` | Encoded | SOFT=0, MEDIUM=1, HARD=2, WET=3, INTER=4 |
| `num_stints` | `int8` | lap_data | Number of stints in race |
| `num_pit_stops` | `int8` | lap_data | Number of pit stops |

#### Weather Features

| Column | Dtype | Source | Description |
|---|---|---|---|
| `air_temp_mean` | `float32` | weather_data | Mean air temperature (°C) |
| `track_temp_mean` | `float32` | weather_data | Mean track temperature (°C) |
| `is_wet_race` | `int8` | weather_data | 1 if rainfall=True |

#### Temporal Features

| Column | Dtype | Derived | Description |
|---|---|---|---|
| `round_number` | `int8` | session | Race round (1–24) |
| `season_stage` | `int8` | round / total_rounds | 0=early, 1=mid, 2=late (thirds) |

---

## Notes

- All rolling features are **strictly historical** — computed using only races prior to the current one. No leakage.
- DNFs in rolling averages are assigned `finish_position = 20` (worst case).
- Qualifying times are normalised as `%_gap_to_pole` to make them comparable across circuits.
- `lap_time_vs_field_pct` normalises race pace across circuits with different base lap times.
- `starting_compound_enc` replaces the string `starting_compound` for model input.

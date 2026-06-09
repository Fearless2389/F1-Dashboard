# Paddock Dashboard — Session Handoff

> **For the next Claude session:** Read this top-to-bottom before doing anything.
> Ask the user which item from "What to pick next" they want, then execute.

---

## TL;DR (60 seconds)

**Project:** A full-stack F1 ML analytics dashboard called **Paddock Dashboard**.
React + FastAPI + 6 ML models + interactive race replay with broadcast-quality animation.

**Location:** `C:\Users\ruthv\OneDrive\Desktop\F1 ML\`
**GitHub (active):** https://github.com/Fearless2389/F1-Dashboard (remote name `dashboard`, branch `main`)
**GitHub (old, preserved):** https://github.com/Fearless2389/f1-ml (remote name `origin`, **don't push here**)

**User context:** Windows 11, prefers native dev over Docker, uses bash (MinGW) + PowerShell, building this for a resume / portfolio. Wants "cracked FAANG engineer" output quality.

**Last commits on `dashboard/main`:**
- `bd4a22b` — Live overtake feed (events stream as playhead crosses them)
- `b631114` — Remove DRS-zone overlay
- `27c607e` — Initial Paddock Dashboard push (full rebuild)

---

## Architecture in one glance

```
F1 ML/
├── src/
│   ├── api/               # FastAPI app
│   │   ├── main.py        # lifespan, CORS, warm-up daemon
│   │   ├── routers/       # /predict, /live, /schedule, /historical,
│   │   │                  # /replay, /apex, /models
│   │   └── schemas/       # Pydantic v2 models
│   ├── live/
│   │   ├── replay.py              # Replay class — the big one (1000+ lines)
│   │   ├── telemetry_replay.py    # car_data loader, /telemetry/{driver}
│   │   ├── current_grid.py        # 2026 roster + OpenF1 enrichment
│   │   └── schedule.py / openf1_client.py / jolpica_client.py
│   ├── inference/         # predict_race, simulator (Plackett-Luce MC), apex
│   ├── models/            # XGBoost top10/podium/DNF, LightGBM winner/FL/quali
│   └── ingestion/         # FastF1 fetchers
├── web/                   # React + Vite + Tailwind v4 + TS
│   ├── src/
│   │   ├── hooks/         # useReplay (the big one), useDriverTelemetry,
│   │   │                  # useLiveSocket, useApi
│   │   ├── components/panels/
│   │   │   ├── ReplayTrackMap.tsx    # SVG circuit + dots + SC + sectors
│   │   │   ├── DriverTelemetry.tsx   # F1-TV-style speed/gear/throttle/brake
│   │   │   ├── TimingTower.tsx       # tower with tyre age
│   │   │   ├── OvertakeFeed.tsx      # LIVE — events stream in
│   │   │   ├── ReplayControls.tsx    # play/pause/seek/speed
│   │   │   └── …
│   │   └── routes/ReplayRoute.tsx    # the page everything mounts on
├── data/                  # parquets + caches (mostly .gitignore'd)
└── tests/                 # pytest (27 backend) + vitest (11 frontend)
```

---

## How the user runs this locally

**Their daily setup:**
- uvicorn on port **8000** — `python -m uvicorn src.api.main:app --port 8000`
- Vite on port **5173** (or 5175 if 5173 is taken) — `cd web && npm run dev`
- Browser at `http://localhost:5173/replay/2025/1` etc.

**When backend changes:** they must **restart uvicorn + hard-refresh** the browser (Ctrl+Shift+R). The React Query persister caches API responses in `localStorage` keyed by a "buster" string in `web/src/main.tsx` — bump it (`v3-drs-sectors` → `v4-…`) to invalidate caches when the response shape changes.

**For your own headless testing** (so you don't kill the user's dev servers):
- Start your uvicorn on **port 8010** in background
- Start your Vite on **port 5180** with `VITE_API_PROXY=http://localhost:8010 npm run dev -- --port 5180 --strictPort`
- Use Playwright (already installed; Chromium at `~/AppData/Local/ms-playwright/chromium-1223`)
- Sample script pattern: `web/scripts/replay_*.mjs` — many examples exist
- **Always stop your side servers when done** with `PowerShell Stop-Process -Id (Get-NetTCPConnection -LocalPort <port>).OwningProcess`

**Tests:**
```bash
cd "/c/Users/ruthv/OneDrive/Desktop/F1 ML"
python -m pytest tests/ -q                    # 27 backend tests
cd web && npm test -- --run                   # 11 frontend tests
cd web && npx tsc --noEmit                    # type-check
```

---

## What's built right now (replay page is the focal point)

✅ = done · ⏳ = deferred · ❌ = explicitly removed

### Backend
- ✅ Race replay engine reading FastF1 cache pickles (timing, position, car_data)
- ✅ Per-driver session-time trajectory with **leader-curve + gap-offset** progress model
- ✅ Race-window bounds (`race_start_t` / `race_end_t`) so pre-race noise is hidden
- ✅ Lap marks, sector marks (real, not 1/3 + 2/3), pit windows, lap times
- ✅ Safety Car detection from track_status
- ✅ Telemetry endpoint `/api/replay/{s}/{r}/telemetry/{driver}?from_t&to_t` (5 Hz from `car_data.ff1pkl`)
- ✅ Overtakes with sector-time → session-time mapping
- ✅ Multi-target ML: top10, podium, winner ranker, DNF, fastest_lap, quali
- ✅ Apex Predictor (SHAP-templated reasoning), Monte Carlo simulator
- ✅ Apscheduler warm-up daemon — pre-loads 6 model pickles + parquets on boot
- ❌ DRS-zone overlay (removed at user request — not the same as the DRS *badge* in telemetry panel, which IS kept)

### Frontend — `/replay/:season/:round`
- ✅ rAF-driven session-time playhead, smooth 60 fps motion
- ✅ Dots strictly on the racing line (real SVG circuit outlines)
- ✅ Speed buttons **2× / 4× / 8× / 16× / 32×** (default 8×, real-time semantics)
- ✅ DNF drivers hidden from track; pit-window drivers dimmed to 30 %
- ✅ Safety Car as an amber pulsing dot (deploying / on_track / returning phases)
- ✅ F1-TV-style driver telemetry mini-window — **Speed (white) / Gear (grey, stepwise) / Throttle (green) + Brake (red)** at 5 Hz, rolling 30 s window
- ✅ Timing tower with **tyre age** (L1/L2/L3…) next to compound chip
- ✅ Sector dividers (S1/S2 ticks, subtle light-grey)
- ✅ Driver labels above dots (default ON, **L** toggles)
- ✅ Live overtake feed — events stream in as the playhead crosses them, newest on top, "NEW" coral pulse for ~4 s on freshest event, S1/S2/S3 sector tags, "Lead" / "Podium" editorial badges, click → seek 3 s before
- ✅ Keyboard shortcuts (see below) with on-screen cheat-sheet popover (**Keys** button or **H** key)

### Keyboard shortcuts
| Key | Action |
|---|---|
| Space | Play / Pause |
| ← → | Step lap back / forward |
| 1-5 | Speed 2× / 4× / 8× / 16× / 32× |
| L | Toggle driver labels on track |
| T | Toggle timing tower |
| W | Toggle win-probability chart |
| H or ? | Show / hide keyboard cheat-sheet |
| Esc | Deselect driver / close panels |

---

## What to pick next (user will choose)

When the new session starts, **ask the user which of these to do** (don't just pick one).
They've already approved the *direction* of all of these; they just need to pick the order.

### Live-overtake-feed enhancements (continuation of the most recent work)
1. **Driver / team filter chips** — `VER ✕` / `Ferrari ✕` to track one storyline
2. **Track-map arrow flash** — when an overtake happens, briefly draw a connecting line + arrow between the two drivers' dots
3. **Mini track icon per event** — tiny circuit-shape thumbnail showing the spot of each move
4. **Hover preview** — hover a row → mini timing-tower snapshot at that moment
5. **"Most active overtaker" leaderboard** — small ranking at the top: "VER: 8 · HAM: 7 · ALO: 5"
6. **Toggleable sound cue** — soft "ding" on each new overtake (some users love it, some hate it)

### Race-replay polish
7. **Driver trail effect** — last 3 positions fade behind each car like a comet (broadcast feel)
8. **Telemetry "Current Lap by distance" mode** — toggle in the telemetry panel; x-axis becomes lap distance instead of session-time (Tom Shaw's two-mode toggle)
9. **2024 telemetry re-fetch** — only 2025 races have `car_data.ff1pkl` cached. A script `src/ingestion/fetch_telemetry.py` that does `session.load(telemetry=True)` for ~80 older races (~40 min one-time fetch). Unlocks the telemetry panel for older races.

### Cross-app improvements (not replay-specific)
10. **Standings page polish** — last-race podium hero is good but more interactive elements could help
11. **Driver page** — currently locked to 2026 grid only. Could add a season comparison ("VER 2024 vs VER 2025") chart
12. **Race recap** — auto-generate a 200-word recap after the race ends (could use SHAP-templated, no LLM needed)
13. **Apex page polish** — add lap-by-lap "predicted vs actual" tracking once a race is underway

---

## Things to know about the user

- They want **portfolio polish** — design choices matter. Reference: "cracked FAANG engineer" output.
- They like **incremental commits + push to F1-Dashboard** after each meaningful change.
- They want to **keep `origin` (f1-ml) untouched** — only push to `dashboard` (F1-Dashboard).
- Resume bullets for this project are in `handoff.md` is not the place — but the project IS resume material; they may ask for help framing it again.
- They prefer **markdown writeups → Word at submission** time (per memory) but this project isn't for that.
- They will likely ask me to **commit + push** after each batch of changes. Pattern:
  ```bash
  git add -u <changed files>
  git commit -m "<scoped message>"
  git push dashboard main
  ```

---

## Useful one-liners for the new session

**Run my own dev environment without disturbing the user's:**
```bash
cd "/c/Users/ruthv/OneDrive/Desktop/F1 ML"
python -m uvicorn src.api.main:app --port 8010 --log-level warning &   # background
cd web && VITE_API_PROXY=http://localhost:8010 npm run dev -- --port 5180 --strictPort &
```

**Probe the trajectory endpoint (sanity-check what the backend serves):**
```bash
curl -s http://localhost:8010/api/replay/2025/1/trajectory | python -c "
import sys, json
j = json.load(sys.stdin)
print('keys:', list(j.keys()))
print('race_start_t:', j.get('race_start_t'))
print('drivers:', len(j['drivers']))
print('overtakes:', len(j.get('overtakes', [])))
"
```

**Race shortlist with cached car_data (telemetry works on these):**
- 2025 R1 Australia (wet race, lots of SC)
- 2025 R4 Bahrain (clean, ideal demo)
- 2025 R5 Saudi, R6 Miami, R7 Imola, R11 Austria — all have telemetry
- 2024 races — **no** car_data cached; telemetry returns 204

**Restart cleanup** (kill the side servers when done):
```powershell
$p1 = (Get-NetTCPConnection -LocalPort 8010 -ErrorAction SilentlyContinue).OwningProcess
$p2 = (Get-NetTCPConnection -LocalPort 5180 -ErrorAction SilentlyContinue).OwningProcess
if ($p1) { Stop-Process -Id $p1 -Force -ErrorAction SilentlyContinue }
if ($p2) { Stop-Process -Id $p2 -Force -ErrorAction SilentlyContinue }
```

---

## Files worth opening first when continuing

If the user picks an **overtake feature**:
- `web/src/components/panels/OvertakeFeed.tsx` (the panel itself)
- `web/src/routes/ReplayRoute.tsx` (mounting + props)
- `src/api/routers/replay.py:replay_overtakes` (the data source)

If the user picks **driver trail**:
- `web/src/components/panels/ReplayTrackMap.tsx` (the dots loop)
- `web/src/hooks/useReplay.ts` (snapshot composition)

If the user picks **telemetry distance mode**:
- `web/src/components/panels/DriverTelemetry.tsx`
- `web/src/hooks/useDriverTelemetry.ts`
- `src/live/telemetry_replay.py` (would need to add distance from `pos_data`)

If the user picks **2024 telemetry re-fetch**:
- Look at `src/ingestion/fetch_sessions.py` for existing FastF1 fetch pattern
- New file: `src/ingestion/fetch_telemetry.py`

---

## How the user should use this handoff.md

> **This section is for the user (you), not the new Claude.**

When you start a fresh Claude Code session in this project directory:

1. **Save this file as `handoff.md` in the project root** — done.
2. **Start a new Claude Code session** (`claude` in the terminal, in the project directory).
3. **First message to send the new Claude:**
   > Read `handoff.md` end-to-end before doing anything. After you've read it, summarise back to me in one paragraph what state the project is in, then ask me which item from "What to pick next" I want to work on.

   That single message gets the new Claude fully oriented in ~30 seconds.

4. **Auto-mode preference:** if you want the new session to act autonomously (like this one has been), tell it:
   > Auto mode: act autonomously, minimise interruptions, prefer action over planning. But still ask before destructive actions or pushing to GitHub.

5. **When you've decided what to work on**, just tell the new Claude — e.g.:
   > Let's do #2 — track-map arrow flash on overtakes.

   The new Claude will use this doc + the auto-loaded memory at `~/.claude/projects/C--Users-ruthv/memory/` (which already knows your preferences) to continue without missing a beat.

6. **Pushing to F1-Dashboard:** when the new Claude finishes a batch of changes, say:
   > Commit and push to dashboard.
   The new Claude will run `git add` + `git commit -m "…"` + `git push dashboard main`.

7. **If something feels wrong** ("DRS overlay is back?", "the old broken version is showing"): the most common cause is **stale uvicorn or stale Vite cache**. Restart uvicorn, hard-refresh browser, and in `web/src/main.tsx` bump the persister `buster: "v3-…"` string to invalidate cached API responses in `localStorage`.

8. **If the new session ever feels lost** — paste this same handoff.md again. It's idempotent.

---

## What this session shipped (chronological, for memory)

If the new session asks "what just happened?", here it is:

- **Replay engine v2** — switched from per-lap snapshots to per-second session-time playback with rAF interpolation. Added race-start anchoring so playback doesn't waste an hour on pre-race samples.
- **Speed semantics fix** — 1× was 105× realtime; now 1× = realtime. Speeds: 2/4/8/16/32×.
- **Dot placement fix** — removed fan-stack (was throwing dots off-track); cars now strictly on racing line.
- **Pause-at-start fix** — synthetic `(race_start_t, 0)` sample prepended per driver so play button works immediately.
- **Safety Car animation** — amber pulsing dot at `leader_progress + 0.05` lap, deploy/on_track/return phases.
- **Driver telemetry mini-window** — F1-TV-style Speed / Gear / Throttle / Brake at 5 Hz from `car_data.ff1pkl`. Lazy 30 s window via `useDriverTelemetry` with `keepPreviousData`.
- **Tyre age in tower** — computed from `compound_changes` per current lap.
- **Keyboard shortcuts + cheat-sheet popover** — Space / arrows / 1-5 / L / T / W / H / Esc.
- **DRS overlay added then removed** — user changed mind. Static circuit metadata `drs_zones` on Schedule page kept.
- **Sector dividers** — S1/S2 ticks at real sector boundaries (not 1/3 + 2/3).
- **Live overtake feed** — events stream in, newest on top, NEW pulse, sector tag, Lead / Podium tags, click → seek 3 s before.
- **GitHub workflow** — `dashboard` remote added pointing to `F1-Dashboard`. `origin → f1-ml` untouched. 3 commits pushed.

Tests at session end: **27 backend + 11 frontend passing**, TypeScript clean.

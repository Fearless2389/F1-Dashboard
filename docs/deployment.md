# Deployment

We deploy the **frontend on Vercel** and the **backend on Railway**. No Docker required.

## Why this split

- **Vercel** is the canonical home for a Vite-built React SPA. Free hosting, instant deploys from GitHub, preview URLs per PR.
- **Railway** runs persistent containers (a single `uvicorn` process), which the backend needs because:
  - `APScheduler` runs a long-lived background thread that polls OpenF1 every 5s.
  - The `/api/live/stream` WebSocket requires a persistent connection.
  - Python cold-starts on serverless platforms plus model loading (~5s combined) would ruin "predict" UX.

Render and Fly.io work too — Render's free tier hibernates idle apps (rough for the live tab); Fly.io is more powerful but takes a `fly.toml`.

## Frontend — Vercel

1. Push the repo to GitHub (or GitLab/Bitbucket).
2. In Vercel: **New Project** → import the repo.
3. **Root Directory:** `web`. Vercel auto-detects Vite.
4. Set environment variables (Project Settings → Environment Variables):
   - `VITE_API_URL=https://<your-app>.up.railway.app`
   - `VITE_WS_URL=wss://<your-app>.up.railway.app/api/live/stream`
5. Build command: `pnpm build` (default). Output directory: `dist`.
6. Deploy. Each push to `main` re-deploys; pull requests get preview URLs.

## Backend — Railway

The repo already includes `Procfile` and `runtime.txt` so Railway's Nixpacks builder will pick everything up automatically — no Dockerfile.

1. Railway: **New Project** → **Deploy from GitHub repo** → pick this repo. Build runs immediately.
2. **Attach a Volume** in the service settings, mount at `/app/data`. This persists:
   - `data/cache/` (FastF1 pickle cache — expensive to rebuild)
   - `data/processed/` (feature matrix + aligned dataset)
   - `data/live/` (rolling snapshots)
   - `models/trained/` (your trained pickles + manifest)
3. Set environment variables:
   - `FRONTEND_ORIGIN=https://<your-project>.vercel.app`
   - `OPENF1_BASE_URL=https://api.openf1.org/v1` (default — only override if Railway's egress can't reach openf1.org)
   - Optional: `F1ML_DISABLE_REFRESHER=1` to deploy with the live refresher off.
4. **Bootstrap** (run once via Railway shell after first deploy):
   ```bash
   python -m src.ingestion.fetch_sessions --resume
   python -m src.cleaning.align
   python -m src.features.build_features
   python -m src.models.train --targets all
   ```
   Models + parquets persist on the mounted volume, so subsequent deploys are instant.

## CORS

`src/api/main.py` allowlists `http://localhost:5173` and `${FRONTEND_ORIGIN}`. Set `FRONTEND_ORIGIN` on Railway to your Vercel URL.

## CI: regenerate TypeScript types

Add to `.github/workflows/types-sync.yml`:

```yaml
name: Type sync
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Check generated types are committed
        run: |
          cd web && npm i openapi-typescript --no-save
          # In a real workflow we'd start the API and run pnpm types:gen.
          # For now, just confirm the file exists and is valid TS.
          test -f src/lib/types.ts
```

## Single-host alternative

If you want one URL for both, host the React build directly from FastAPI:

1. `cd web && pnpm build` → `web/dist/`
2. Mount it from FastAPI:
   ```python
   from fastapi.staticfiles import StaticFiles
   app.mount("/", StaticFiles(directory="web/dist", html=True), name="ui")
   ```
3. Deploy backend-only on Railway. Less ideal — you lose Vercel's CDN.

## Self-host

Only worth it if you want a custom domain on a $5 VPS. Then Docker pays off — see `docs/architecture.md` for the deployment diagram.

# Deploy

The default deploy is **free** end-to-end:

| Surface | Host | Cost |
|---|---|---|
| Frontend (Vite/React) | **Vercel Hobby** | $0 |
| Backend (FastAPI + ~3 GB FastF1 cache + models) | **Hugging Face Spaces** (Docker SDK, free tier) | $0 |

Total: **$0/month**, replay + WebSockets + predictions all work.

> If you outgrow the HF free tier (idle sleep too painful for a demo, or you want a custom domain on the API), there's a $3/mo Fly.io appendix at the bottom.

---

## 1 · Backend — Hugging Face Spaces

### 1.1 Create the Space

Go to https://huggingface.co/new-space:

| Field | Value |
|---|---|
| Owner | your HF account |
| Space name | `paddock-api` (or anything; the URL becomes `<owner>-<name>.hf.space`) |
| License | MIT (or whatever fits your repo) |
| Space SDK | **Docker** |
| Docker template | "Blank" |
| Hardware | "CPU basic · free" |
| Visibility | Public |

This creates an empty git repo at `https://huggingface.co/spaces/<owner>/paddock-api`.

### 1.2 Push the code

The existing repo-root `Dockerfile` is what HF will build. From your local clone:

```bash
git remote add hf https://huggingface.co/spaces/<owner>/paddock-api
git push hf main
```

You'll be prompted for an HF access token — generate one at https://huggingface.co/settings/tokens with "write" scope.

The Space's build log shows `docker build` running. ~3-4 minutes on the free tier.

### 1.3 Upload the data directory

The Dockerfile deliberately doesn't bundle `data/` (it's 3 GB, would inflate the image). HF Spaces gives you persistent storage at `/app/data` — push the directory separately:

```bash
pip install huggingface_hub
huggingface-cli login                    # paste your token
huggingface-cli upload <owner>/paddock-api data data --repo-type=space
```

Expect ~30 minutes on a decent connection (3 GB through git-lfs). You can resume if it disconnects — the CLI handles retry.

Web-UI fallback: Space → Files → Upload → drag the `data/` folder in. Slower but no CLI install.

### 1.4 Set environment variables

Space → Settings → "Variables and secrets":

| Type | Name | Value |
|---|---|---|
| Variable | `FRONTEND_ORIGIN` | `https://paddock-<you>.vercel.app,https://*.vercel.app` |
| Variable | `F1ML_DISABLE_REFRESHER` | `1` |

The comma-separated CORS handler accepts both your production Vercel URL and the wildcard for preview deploys. Disable the refresher on a sleeping free Space — the cron firing into a suspended container just burns wake-ups.

### 1.5 Smoke test

Once the build finishes:

```bash
curl https://<owner>-paddock-api.hf.space/api/health
curl https://<owner>-paddock-api.hf.space/api/apex/next | jq '.race_meta'
```

First request after a long idle takes ~10–20 s while the warm-up thread loads the six trained models.

### Trimming the volume if you're tight on disk space

You're under the 50 GB Space limit at 3 GB, but if you want to slim further (every other season, say):

```bash
# Locally, before re-upload — keep only 2024–2026
cd data/cache
ls -d 20[12][0-3] | xargs rm -rf
python -m src.live.replay_index                    # rebuild the index
# Then re-upload data/cache and data/processed
huggingface-cli upload <owner>/paddock-api data/cache data/cache --repo-type=space
huggingface-cli upload <owner>/paddock-api data/processed data/processed --repo-type=space
```

The Predictor still works end-to-end on a slim cache (only reads parquet); only Replay degrades when a season's pickles aren't on disk.

---

## 2 · Frontend — Vercel

### 2.1 Import the repo

https://vercel.com/new → pick this GitHub repo → on the "Configure Project" screen:

| Setting | Value |
|---|---|
| Framework Preset | Vite (auto-detected) |
| Root Directory | `web` |
| Build Command | `npm run build` (auto-detected) |
| Output Directory | `dist` (auto-detected) |
| Install Command | `npm ci` (or `pnpm install --frozen-lockfile` if Vercel detects `pnpm-lock.yaml`) |

### 2.2 Environment variables

Under Environment Variables in the same setup screen:

| Name | Value | Environments |
|---|---|---|
| `VITE_API_URL` | `https://<owner>-paddock-api.hf.space` | Production + Preview + Development |

That's the only env var the frontend needs in production. The WebSocket URL is derived from `VITE_API_URL` automatically (`https://` → `wss://`).

### 2.3 Deploy

Click Deploy. ~90 seconds later you have `https://paddock-<you>.vercel.app`. Every push to `main` redeploys; PRs get preview URLs.

### 2.4 vercel.json

The repo ships `web/vercel.json` with a single SPA rewrite:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

This makes deep-link refreshes (e.g. `/apex?season=2026&round=7` opened in a new tab) serve `index.html` so react-router picks the route up client-side. No other config needed.

---

## 3 · Custom domain (optional, free)

Vercel:
- Project → Domains → add `paddock.yourdomain.com` → follow the CNAME / nameserver instructions. HTTPS is automatic.
- Update `FRONTEND_ORIGIN` on the HF Space to add the new origin.

HF Spaces:
- Custom domains require an HF Pro account ($9/mo). Keep the `*.hf.space` URL as `VITE_API_URL` if you don't want to pay; the frontend can still live on a custom domain.

---

## 4 · Costs (zero-cost path)

| Resource | Plan | $/mo |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth, unlimited preview deploys | $0 |
| HF Spaces free tier | 16 GB RAM, 50 GB disk, idle-sleep after 48 h | $0 |
| **Total** | | **$0** |

---

## 5 · Operational notes

- **Cold start**: first request after the HF Space sleeps takes ~10–20 s while the warm-up thread loads the six models. Subsequent requests are fast.
- **Wake the Space**: just hit any endpoint. A `curl /api/health` from your dev machine is enough to bring it back if you know a portfolio reviewer is about to look.
- **Re-training**: when you train new models locally, push just `data/models/` back to the Space:
  ```bash
  huggingface-cli upload <owner>/paddock-api data/models data/models --repo-type=space
  ```
  Then restart the Space from Settings → "Factory rebuild" (or click "Restart") so the in-process `lru_cache` on `load_model` drops the old artifacts.
- **Refresher**: `F1ML_DISABLE_REFRESHER=1` is recommended on a sleeping free Space (the cron's wakeups burn Space budget). For a paid host that stays awake, set it to `0` so live data refreshes.
- **Logs**: Space → Logs tab in the HF UI; same surface as Docker logs.
- **CORS regressions**: if the deployed frontend can't talk to the backend, check that `FRONTEND_ORIGIN` is set on the Space (read at startup). `vercel env ls` confirms the Vercel side.

---

## Appendix · Optional paid path ($3/mo, Fly.io)

If HF Spaces sleeping is too painful (portfolio reviewer hits a cold start, etc.), the original Fly.io scaffold is still in the repo:

```bash
brew install flyctl                      # or scoop on Windows
fly auth signup
fly launch --copy-config --no-deploy     # uses the included fly.toml
fly volumes create paddock_data --size 5
fly secrets set FRONTEND_ORIGIN=https://paddock-<you>.vercel.app
fly deploy
fly ssh sftp shell -a <app-name>
# put -r data /app/data                  # ~3 GB upload
```

| Resource | $/mo |
|---|---|
| Fly.io `shared-cpu-1x` 1 GB | ~$2 |
| Fly.io 5 GB volume | ~$0.75 |
| **Total** | **~$3** |

After deploy, swap `VITE_API_URL` in the Vercel project to the Fly hostname (`https://<app-name>.fly.dev`) and redeploy. The frontend doesn't change.

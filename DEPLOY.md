# Deploy

Backend on Fly.io with a persistent volume holding the FastF1 cache + trained
model artifacts; frontend on Cloudflare Pages (or Vercel) as a static build
pointing at the backend.

The split exists because the backend needs ~3 GB of data co-located, while
the frontend is a 600 KB Vite bundle that benefits from CDN edge caching.

---

## 1 · Prerequisites

```bash
# Fly CLI
brew install flyctl                # or scoop install flyctl on Windows
fly auth signup                    # or `fly auth login`

# Wrangler (Cloudflare Pages) — optional, only if you use the CLI path
npm install -g wrangler
wrangler login
```

The backend needs roughly 3 GB on the volume; check your local size first so
nothing surprises you mid-upload:

```bash
du -sh data/cache data/models data/processed
```

## 2 · Backend — Fly.io

```bash
# From the repo root.
fly launch --copy-config --no-deploy        # reads fly.toml; pick an app name
fly volumes create paddock_data --size 5    # 5 GB, ~60% headroom over 3 GB

# Production CORS origin (your frontend URL — comma-separated for previews).
fly secrets set FRONTEND_ORIGIN=https://paddock.yourdomain.com,https://*.paddock-frontend.pages.dev

fly deploy
```

Populate the volume from your local data directory. Fly's SFTP shell is the
simplest path:

```bash
fly ssh sftp shell -a <your-app-name>
# Inside the shell:
sftp> mkdir /app/data
sftp> put -r data /app/data
```

Or, if the upload is being slow, scp into a one-off machine with the volume
attached and `rsync` from a closer source (e.g. an object-storage bucket
you populated earlier).

Smoke-test the deployed backend:

```bash
curl https://<your-app-name>.fly.dev/api/health
curl https://<your-app-name>.fly.dev/api/apex/next | jq '.race_meta'
```

### Trimming the volume if you're tight on space

The full `data/cache` directory is 3.0 GB across all 195 cached races. If
you only care about recent seasons:

```bash
# Keep only 2024–2026 (everything else stays out of the volume)
fly ssh console -a <your-app-name>
cd /app/data/cache
ls -d 20[12][0-3] | xargs rm -rf
# Then refresh the replay index from the trimmed cache:
python -m src.live.replay_index
```

The Predictor page still works end-to-end on a slim cache (it only reads
parquet); only Replay degrades when a season's pickles aren't on disk.

## 3 · Frontend — Cloudflare Pages

Either via the dashboard (connect repo, set the build dir to `web/`) or CLI:

```bash
cd web
cp .env.example .env.local

# Edit .env.local — point at the deployed backend:
#   VITE_API_URL=https://<your-app-name>.fly.dev

npm ci
npm run build
wrangler pages deploy dist --project-name paddock-dashboard
```

Build settings if you're configuring via the dashboard:

| Field | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm ci && npm run build` |
| Build output directory | `web/dist` |
| Root directory | `web` |
| Environment variable | `VITE_API_URL = https://<your-app-name>.fly.dev` |

Same path works on Vercel — set the root directory to `web/` and the
`VITE_API_URL` env var in the project settings.

## 4 · Custom domain (optional)

```bash
fly certs create api.paddock.yourdomain.com -a <your-app-name>
# Add a CNAME pointing api.paddock.yourdomain.com → <your-app-name>.fly.dev
```

Then update `VITE_API_URL` in the frontend env to the custom domain so the
WebSocket also lands there (the same-host derivation in `api.ts:wsUrl`).

## 5 · Costs (ballpark, as of 2026)

| Resource | Plan | $/mo |
|---|---|---|
| Fly.io `shared-cpu-1x` 1 GB | scale-to-zero when idle | ~$2 |
| Fly.io 5 GB volume | always-on | ~$0.75 |
| Cloudflare Pages | free tier | $0 |
| Total | | ~$3 |

If you outgrow the free tier on Pages (>500 builds/month) the next step is
Vercel's hobby tier or self-hosting the frontend on the same Fly machine.

## 6 · Operational notes

- **First request after idle**: the warm-up thread loads the six trained
  `.pkl` models on import. Cold-start is ~5–8 seconds; the `auto_stop_machines = "stop"`
  setting in `fly.toml` means after 5 min of no traffic the machine sleeps.
- **Refresher**: `F1ML_DISABLE_REFRESHER=1` will disable the live-data
  cron loop. Leave it on for real deploys so the Live Race page stays fresh.
- **Logs**: `fly logs -a <your-app-name>`. The warm-up thread logs once on
  startup so you can see the parquet/model load times.
- **Re-training**: when you re-train models locally, `rsync` the new
  `data/models/` directory back to the volume, then restart the machine so
  the `load_model` `lru_cache` (which holds the old artifacts in memory)
  drops:
  ```bash
  fly machine restart -a <your-app-name>
  ```
- **CORS regressions**: if the deployed frontend can't talk to the backend,
  check that `FRONTEND_ORIGIN` was set before `fly deploy` (it's read at
  startup, not per-request). `fly secrets list -a <your-app-name>` confirms.

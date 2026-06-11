# syntax=docker/dockerfile:1.6
#
# Backend-only image for the F1 ML / Paddock Dashboard API.
#
# We do NOT bundle the React frontend here — it deploys separately to a
# static host (Cloudflare Pages / Vercel) and hits this backend via the
# VITE_API_PROXY env var. Keeping them split lets the frontend live on a
# CDN edge with global cache and the backend stay closer to its data.
#
# Build:   docker build -t paddock-api .
# Run:     docker run --rm -p 8000:8000 -v $PWD/data:/app/data paddock-api
#
# In production (Fly.io): the `data/` directory is a mounted volume — see
# fly.toml. The image itself is ~600 MB; the volume holds the FastF1 cache
# + trained model artifacts (~3 GB total).

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps — LightGBM needs libgomp (OpenMP runtime) at runtime; everything
# else is pure-Python wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so layer cache survives source-only edits.
# Streamlit is pulled in by requirements.txt for the legacy UI; we strip it
# here to keep the image lean (the dashboard doesn't use it).
COPY requirements.txt ./
RUN sed -i '/^streamlit/d' requirements.txt && \
    pip install -r requirements.txt

# Application source. data/ is intentionally NOT copied — it lives on the
# mounted persistent volume / HF Space repo. .dockerignore keeps web/,
# node_modules/, etc out. The trained model artifacts are tiny (~2.8 MB
# total across 7 .pkl files) and version-tracked alongside the code, so we
# bundle them into the image instead of asking users to upload them
# separately to the Space's data directory.
COPY src/ ./src/
COPY models/ ./models/

# Non-root user — Fly.io complains if we run as root.
RUN useradd --create-home --uid 1000 app && \
    mkdir -p /app/data && \
    chown -R app:app /app
USER app

ENV PORT=8000 \
    HOST=0.0.0.0 \
    PYTHONPATH=/app

EXPOSE 8000

# Health check hits /api/health — the meta router exposes it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/api/health || exit 1

CMD ["sh", "-c", "uvicorn src.api.main:app --host ${HOST} --port ${PORT}"]

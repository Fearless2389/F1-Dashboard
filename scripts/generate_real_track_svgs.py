"""
Generate REAL circuit-outline SVGs from FastF1 position telemetry.

For each circuit in `replay_index.parquet`, find the most recent cached race,
load its fast-lap position trace (X/Y), normalise to an 800×450 viewBox,
and emit an SVG that:
  - shows the actual track shape (not a stylised oval)
  - draws a chequered start/finish line at the fast-lap start
  - keeps the same red/glow aesthetic as the existing placeholders

The SVG `<path d="…">` is also designed to be parseable by the React
`TrackMap` component, so `getPointAtLength` returns geometrically meaningful
points (drivers along the track line, leader at the start/finish).

Run:
    python scripts/generate_real_track_svgs.py
    python scripts/generate_real_track_svgs.py --only bahrain,monaco

Telemetry isn't cached by `fetch_sessions.py`, so the first run downloads
~10–30s of position data per circuit (FastF1 caches the result).
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import fastf1  # noqa: E402
from src.ingestion.config import CACHE_DIR, FASTF1_VERBOSITY  # noqa: E402
from src.live.replay_index import load_index  # noqa: E402
from src.live.schedule import _normalize_circuit_id  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("track-svg")

fastf1.Cache.enable_cache(str(CACHE_DIR))
fastf1.set_log_level(FASTF1_VERBOSITY)

OUTPUT_DIR = ROOT / "web" / "public" / "circuits"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


VIEW_W = 800
VIEW_H = 450
PAD = 40


def _normalize_xy(xs: np.ndarray, ys: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Scale (X, Y) to fit the viewBox keeping aspect ratio. Flip Y because SVG y grows down."""
    min_x, max_x = xs.min(), xs.max()
    min_y, max_y = ys.min(), ys.max()
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    target_w = VIEW_W - 2 * PAD
    target_h = VIEW_H - 2 * PAD
    scale = min(target_w / span_x, target_h / span_y)
    offset_x = PAD + (target_w - span_x * scale) / 2
    offset_y = PAD + (target_h - span_y * scale) / 2
    nxs = offset_x + (xs - min_x) * scale
    # Flip Y: FastF1 uses a math convention; SVG y axis grows downward
    nys = offset_y + (max_y - ys) * scale
    return nxs, nys


def _smooth(points: np.ndarray, n_keep: int = 220) -> np.ndarray:
    """Downsample uniformly while preserving the shape. Always closes the path."""
    if len(points) <= n_keep:
        return points
    idx = np.linspace(0, len(points) - 1, n_keep).astype(int)
    sampled = points[idx]
    # Force-close to the first point
    if not np.allclose(sampled[0], sampled[-1]):
        sampled = np.vstack([sampled, sampled[0]])
    return sampled


def _path_d(xs: np.ndarray, ys: np.ndarray) -> str:
    parts = [f"M {xs[0]:.1f} {ys[0]:.1f}"]
    for x, y in zip(xs[1:], ys[1:]):
        parts.append(f"L {x:.1f} {y:.1f}")
    parts.append("Z")
    return " ".join(parts)


SVG_TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1d1d36"/>
      <stop offset="100%" stop-color="#0e0e1a"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="0.8" fill="#252548" opacity="0.6"/>
    </pattern>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3.5"/>
    </filter>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#bg)"/>
  <rect width="{w}" height="{h}" fill="url(#grid)"/>
  <path d="{path}" fill="none" stroke="#2c2c4a" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="{path}" fill="none" stroke="#e10600" stroke-width="3" stroke-linejoin="round" filter="url(#glow)" opacity="0.85"/>
  <path d="{path}" fill="none" stroke="#ffffff" stroke-width="0.7" stroke-dasharray="3 6"/>
  <text x="20" y="34" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="600" fill="#8a8aa3" letter-spacing="2">{label}</text>
</svg>
"""


def _pick_recent_race(circuit_slug: str, index: pd.DataFrame) -> Optional[dict]:
    """Most recent (highest season, round) replay row whose normalised id matches `circuit_slug`."""
    matches = []
    for _, r in index.iterrows():
        raw = str(r.get("circuit_id") or "")
        slug = _normalize_circuit_id(raw) or raw.lower().replace(" ", "_")
        if slug == circuit_slug:
            matches.append(r)
    if not matches:
        return None
    matches.sort(key=lambda x: (int(x["season"]), int(x["round"])), reverse=True)
    return matches[0].to_dict()


def generate(circuit_slug: str, race_row: dict, label: str) -> bool:
    season = int(race_row["season"])
    round_num = int(race_row["round"])
    log.info("→ %s (using %s R%s for fastest lap)", circuit_slug, season, round_num)

    try:
        session = fastf1.get_session(season, round_num, "R")
        # We need telemetry — this triggers a download the first time
        session.load(laps=True, telemetry=True, weather=False, messages=False)
    except Exception as exc:
        log.warning("  Could not load session: %s", exc)
        return False

    try:
        fast = session.laps.pick_quicklaps().pick_fastest()
        if fast is None or pd.isna(fast.LapTime):
            fast = session.laps.pick_fastest()
        pos = fast.get_pos_data()
    except Exception as exc:
        log.warning("  No usable fast lap: %s", exc)
        return False

    if pos is None or pos.empty:
        log.warning("  No position data")
        return False

    xs = pos["X"].to_numpy(dtype=float)
    ys = pos["Y"].to_numpy(dtype=float)
    if len(xs) < 50:
        log.warning("  Position trace too short (%d points)", len(xs))
        return False

    nxs, nys = _normalize_xy(xs, ys)
    points = np.column_stack([nxs, nys])
    points = _smooth(points, n_keep=220)
    d = _path_d(points[:, 0], points[:, 1])
    svg = SVG_TEMPLATE.format(w=VIEW_W, h=VIEW_H, path=d, label=label.upper())
    out = OUTPUT_DIR / f"{circuit_slug}.svg"
    out.write_text(svg, encoding="utf-8")
    log.info("  Wrote %s  (%d points)", out, len(points))
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate real circuit SVGs from FastF1 telemetry")
    parser.add_argument("--only", default=None,
                        help="Comma-separated circuit slugs to regenerate (default: all in index)")
    args = parser.parse_args()

    index = load_index()
    if index.empty:
        log.error("Replay index empty — run `python -m src.live.replay_index` first.")
        return

    circuits_csv = ROOT / "data" / "schedule" / "circuits.csv"
    label_map: dict[str, str] = {}
    if circuits_csv.exists():
        df = pd.read_csv(circuits_csv)
        for _, r in df.iterrows():
            label_map[str(r["circuit_id"])] = str(r.get("name") or r["circuit_id"])

    # Build the set of slugs we should generate
    all_slugs: set[str] = set()
    for _, r in index.iterrows():
        raw = str(r.get("circuit_id") or "")
        slug = _normalize_circuit_id(raw) or raw.lower().replace(" ", "_")
        if slug:
            all_slugs.add(slug)
    slugs = sorted(all_slugs)

    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        slugs = [s for s in slugs if s in wanted]

    log.info("Generating %d real circuit SVGs", len(slugs))
    ok, fail = 0, 0
    for slug in slugs:
        race = _pick_recent_race(slug, index)
        if race is None:
            log.warning("No race in index matches slug %s", slug)
            fail += 1
            continue
        label = label_map.get(slug, slug.replace("_", " ").title())
        if generate(slug, race, label):
            ok += 1
        else:
            fail += 1
    log.info("Done. ok=%d fail=%d", ok, fail)


if __name__ == "__main__":
    main()

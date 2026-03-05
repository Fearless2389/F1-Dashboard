"""
End-to-end F1 ML pipeline runner.

Runs all phases in order:
  1. Fetch session data (race results, qualifying, weather)
  2. Fetch lap data
  3. Clean and align datasets
  4. Build feature matrix
  5. Train models
  6. Run evaluation and analysis (optional)

Usage:
    python run_pipeline.py                          # full run, all seasons
    python run_pipeline.py --seasons 2023           # single season (fast test)
    python run_pipeline.py --skip-fetch             # data already downloaded
    python run_pipeline.py --skip-analysis          # skip SHAP (faster)
    python run_pipeline.py --model xgb              # XGBoost only
"""

import argparse
import logging
import subprocess
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent


def run_step(label: str, module: str, extra_args: list[str] = None) -> bool:
    """Run a pipeline step as a subprocess. Returns True on success."""
    cmd = [sys.executable, "-m", module] + (extra_args or [])
    log.info(f"\n{'═'*60}")
    log.info(f"  {label}")
    log.info(f"  cmd: {' '.join(cmd)}")
    log.info(f"{'═'*60}")

    t0 = time.time()
    result = subprocess.run(cmd, cwd=str(ROOT))
    elapsed = time.time() - t0

    if result.returncode != 0:
        log.error(f"  FAILED (exit {result.returncode}) after {elapsed:.1f}s")
        return False

    log.info(f"  Done in {elapsed:.1f}s")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the full F1 ML pipeline end-to-end"
    )
    parser.add_argument(
        "--seasons", nargs="+", type=int, default=None,
        help="Seasons to fetch (default: 2018–2025). Example: --seasons 2023 2024"
    )
    parser.add_argument(
        "--skip-fetch", action="store_true",
        help="Skip Phase 1 data fetching (use if data already downloaded)"
    )
    parser.add_argument(
        "--skip-analysis", action="store_true",
        help="Skip Phase 5 analysis and SHAP computation"
    )
    parser.add_argument(
        "--model", choices=["both", "xgb", "baseline"], default="both",
        help="Which model(s) to train (default: both)"
    )
    parser.add_argument(
        "--split", choices=["val", "test"], default="val",
        help="Which split to analyse in Phase 5 (default: val)"
    )
    args = parser.parse_args()

    season_args = []
    if args.seasons:
        season_args = ["--seasons"] + [str(s) for s in args.seasons]

    steps_run = 0
    steps_failed = 0

    pipeline_start = time.time()

    # ── Phase 1: Data Ingestion ───────────────────────────────────────────────
    if not args.skip_fetch:
        ok = run_step(
            "Phase 1a — Fetch session data (race, qualifying, weather)",
            "src.ingestion.fetch_sessions",
            season_args + ["--resume"],
        )
        if not ok:
            log.error("Phase 1a failed. Fix errors above and re-run with --skip-fetch if data is partially fetched.")
            sys.exit(1)
        steps_run += 1

        ok = run_step(
            "Phase 1b — Fetch lap data",
            "src.ingestion.fetch_laps",
            season_args + ["--resume"],
        )
        if not ok:
            log.warning("Phase 1b (lap data) failed. Continuing without pace/strategy features.")
            steps_failed += 1
        else:
            steps_run += 1
    else:
        log.info("Skipping Phase 1 (--skip-fetch)")

    # ── Phase 2: Cleaning ─────────────────────────────────────────────────────
    ok = run_step(
        "Phase 2 — Clean and align datasets",
        "src.cleaning.align",
    )
    if not ok:
        log.error("Phase 2 failed. Cannot continue without aligned dataset.")
        sys.exit(1)
    steps_run += 1

    # ── Phase 3: Feature Engineering ─────────────────────────────────────────
    ok = run_step(
        "Phase 3 — Build feature matrix",
        "src.features.build_features",
    )
    if not ok:
        log.error("Phase 3 failed. Cannot continue without feature matrix.")
        sys.exit(1)
    steps_run += 1

    # ── Phase 4: Model Training ───────────────────────────────────────────────
    ok = run_step(
        f"Phase 4 — Train models ({args.model})",
        "src.models.train",
        ["--model", args.model],
    )
    if not ok:
        log.error("Phase 4 failed. Cannot run analysis without trained model.")
        sys.exit(1)
    steps_run += 1

    # ── Phase 5: Analysis ─────────────────────────────────────────────────────
    if not args.skip_analysis:
        analysis_flags = ["--split", args.split]
        ok = run_step(
            f"Phase 5 — Evaluation and analysis ({args.split} set)",
            "src.models.analysis",
            analysis_flags,
        )
        if not ok:
            log.warning("Phase 5 (analysis) failed. Model artifacts are still usable.")
            steps_failed += 1
        else:
            steps_run += 1
    else:
        log.info("Skipping Phase 5 (--skip-analysis)")

    # ── Summary ───────────────────────────────────────────────────────────────
    total = time.time() - pipeline_start
    log.info(f"\n{'═'*60}")
    log.info(f"  Pipeline complete in {total/60:.1f} minutes")
    log.info(f"  Steps succeeded: {steps_run}  |  Failed: {steps_failed}")
    if steps_failed == 0:
        log.info("  All steps passed.")
    log.info(f"\n  Next steps:")
    log.info(f"    Dashboard:  streamlit run src/dashboard/app.py")
    log.info(f"    Predict:    python -m src.inference.predict --input examples/sample_quali_2026_bahrain.csv --circuit 'Bahrain International Circuit' --round 1")
    log.info(f"{'═'*60}\n")


if __name__ == "__main__":
    main()

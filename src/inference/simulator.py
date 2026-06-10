"""
Monte Carlo race simulator.

For each iteration:
  1. Sample DNFs from per-driver prob_dnf.
  2. Among survivors, sample finish order via Plackett-Luce on win-prob scores
     (falls back to top-10 probs when winner model isn't available).
  3. Sample the fastest-lap holder from prob_fastest_lap, conditioned on survival.

Outputs win/podium/expected-points distributions + top podium combinations.
"""

from collections import Counter
from typing import Optional

import numpy as np


POINTS_TABLE = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
}
FASTEST_LAP_BONUS = 1


def _plackett_luce_sample(scores: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Sample a permutation; higher scores more likely to come first."""
    scores = np.maximum(scores, 1e-9)
    n = len(scores)
    remaining = list(range(n))
    order = []
    for _ in range(n):
        sub = scores[remaining]
        p = sub / sub.sum()
        idx = rng.choice(len(remaining), p=p)
        order.append(remaining.pop(idx))
    return np.array(order)


def monte_carlo_race(
    drivers: list[dict],
    n_iterations: int = 1000,
    seed: int = 42,
) -> dict:
    """
    `drivers` — list of dicts with at least driver_code; optionally
                 prob_win, prob_top10, prob_podium, prob_dnf, prob_fastest_lap.
    Returns win_distribution, podium_distribution, expected_points, podium_combinations.
    """
    if not drivers:
        return {
            "win_distribution":   {},
            "podium_distribution": {},
            "expected_points":    {},
            "podium_combinations": [],
        }

    codes = [d["driver_code"] for d in drivers]
    n_drivers = len(codes)

    # Score for finish order: prefer prob_win, fall back to prob_top10, then quali rank
    def _score(d: dict) -> float:
        if d.get("prob_win") is not None:
            return max(float(d["prob_win"]), 1e-6)
        if d.get("prob_top10") is not None:
            return max(float(d["prob_top10"]), 1e-6)
        return max(0.5 / max(int(d.get("quali_position", 10)), 1), 1e-6)

    scores = np.array([_score(d) for d in drivers], dtype=float)

    dnf_probs = np.array(
        [float(d.get("prob_dnf") or 0.05) for d in drivers],
        dtype=float,
    )
    fl_scores = np.array(
        [float(d.get("prob_fastest_lap") or 0.0) for d in drivers],
        dtype=float,
    )
    if fl_scores.sum() == 0:
        fl_scores = scores.copy()  # fall back to win-score weighting

    rng = np.random.default_rng(seed)

    win_counts = Counter()
    podium_counts = Counter()
    points_totals = {code: 0.0 for code in codes}
    podium_combos = Counter()
    # Full position-distribution tracking. position_counts[driver_idx, k] is
    # the number of simulations in which that driver finished at P(k+1).
    # DNFs are bucketed into P20 (the last column) — see plan; v2 may move
    # them to a dedicated "DNF" column.
    position_counts = np.zeros((n_drivers, 20), dtype=np.int64)

    for _ in range(n_iterations):
        # 1) DNFs
        dnf_mask = rng.random(n_drivers) < dnf_probs
        survivor_idx = np.where(~dnf_mask)[0]
        if len(survivor_idx) == 0:
            continue

        # 2) Order survivors
        sub_scores = scores[survivor_idx]
        order_sub = _plackett_luce_sample(sub_scores, rng)
        ordered_indices = survivor_idx[order_sub]

        # 3) Fastest lap among survivors
        sub_fl = fl_scores[survivor_idx]
        if sub_fl.sum() > 0:
            fl_idx = survivor_idx[rng.choice(len(survivor_idx), p=sub_fl / sub_fl.sum())]
        else:
            fl_idx = ordered_indices[0]

        # Tally winner, podium, points
        winner_idx = ordered_indices[0]
        win_counts[codes[winner_idx]] += 1
        podium_idx = ordered_indices[:3]
        for idx in podium_idx:
            podium_counts[codes[idx]] += 1
        podium_combos[tuple(sorted(codes[i] for i in podium_idx))] += 1

        # Position-distribution tally for surviving drivers
        for pos, idx in enumerate(ordered_indices, start=1):
            slot = min(pos - 1, 19)  # cap at column 19 (P20)
            position_counts[idx, slot] += 1
            pts = POINTS_TABLE.get(pos, 0)
            if idx == fl_idx and pos <= 10:
                pts += FASTEST_LAP_BONUS
            points_totals[codes[idx]] += pts

        # DNFs land in the final column so the matrix sums to 1.0 per driver.
        for idx in np.where(dnf_mask)[0]:
            position_counts[idx, 19] += 1

    # Normalise
    def _norm(c: Counter) -> dict[str, float]:
        return {code: c[code] / n_iterations for code in codes}

    expected_points = {code: points_totals[code] / n_iterations for code in codes}

    top_combos = podium_combos.most_common(5)
    podium_combinations = [
        {"drivers": list(trio), "probability": cnt / n_iterations}
        for trio, cnt in top_combos
    ]

    # Position distribution per driver — normalised over iterations.
    position_distribution: dict[str, list[float]] = {}
    expected_position: dict[str, float] = {}
    weights = np.arange(1, 21, dtype=float)
    for i, code in enumerate(codes):
        probs = position_counts[i] / n_iterations
        position_distribution[code] = probs.tolist()
        total = probs.sum()
        if total > 0:
            expected_position[code] = float((probs * weights).sum() / total)
        else:
            expected_position[code] = 20.0

    return {
        "win_distribution":     _norm(win_counts),
        "podium_distribution":  _norm(podium_counts),
        "expected_points":      expected_points,
        "podium_combinations":  podium_combinations,
        "position_distribution": position_distribution,
        "expected_position":     expected_position,
    }

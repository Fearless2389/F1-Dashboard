"""Monte Carlo simulator — deterministic with a fixed seed."""

import pytest

from src.inference.simulator import monte_carlo_race


def _drivers():
    return [
        {"driver_code": "VER", "team_name": "Red Bull",  "quali_position": 1,
         "prob_win": 0.4, "prob_top10": 0.95, "prob_dnf": 0.05, "prob_fastest_lap": 0.3},
        {"driver_code": "LEC", "team_name": "Ferrari",   "quali_position": 2,
         "prob_win": 0.25, "prob_top10": 0.9, "prob_dnf": 0.07, "prob_fastest_lap": 0.2},
        {"driver_code": "NOR", "team_name": "McLaren",   "quali_position": 3,
         "prob_win": 0.15, "prob_top10": 0.85, "prob_dnf": 0.08, "prob_fastest_lap": 0.15},
        {"driver_code": "HAM", "team_name": "Mercedes",  "quali_position": 4,
         "prob_win": 0.1, "prob_top10": 0.8, "prob_dnf": 0.10, "prob_fastest_lap": 0.1},
        {"driver_code": "PER", "team_name": "Red Bull",  "quali_position": 5,
         "prob_win": 0.05, "prob_top10": 0.7, "prob_dnf": 0.15, "prob_fastest_lap": 0.05},
        {"driver_code": "RUS", "team_name": "Mercedes",  "quali_position": 6,
         "prob_win": 0.05, "prob_top10": 0.6, "prob_dnf": 0.10, "prob_fastest_lap": 0.05},
    ]


def test_returns_normalised_distributions():
    result = monte_carlo_race(_drivers(), n_iterations=500, seed=42)
    win = result["win_distribution"]
    podium = result["podium_distribution"]

    assert pytest.approx(sum(win.values()), abs=0.05) == 1.0  # winners total ≈ 1
    assert pytest.approx(sum(podium.values()), abs=0.05) == 3.0  # ≈ 3 podiums per race
    assert set(win.keys()) == {d["driver_code"] for d in _drivers()}


def test_winner_aligns_with_win_prob():
    result = monte_carlo_race(_drivers(), n_iterations=2000, seed=42)
    # The driver with highest win prob should rank #1 in the empirical win distribution
    most_likely = max(result["win_distribution"], key=result["win_distribution"].get)
    assert most_likely == "VER"


def test_deterministic_with_seed():
    a = monte_carlo_race(_drivers(), n_iterations=300, seed=7)
    b = monte_carlo_race(_drivers(), n_iterations=300, seed=7)
    assert a["win_distribution"] == b["win_distribution"]


def test_handles_empty_drivers():
    result = monte_carlo_race([], n_iterations=100)
    assert result["win_distribution"] == {}
    assert result["podium_combinations"] == []

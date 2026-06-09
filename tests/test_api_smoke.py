"""Smoke tests for the FastAPI app — imports + basic endpoints work."""

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    os.environ["F1ML_DISABLE_REFRESHER"] = "1"
    from src.api.main import app
    with TestClient(app) as c:
        yield c


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "F1 ML" in r.json()["service"]


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_version(client):
    r = client.get("/api/version")
    assert r.status_code == 200
    assert "api_version" in r.json()


def test_circuits(client):
    r = client.get("/api/schedule/circuits/all")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 10
    ids = {row["circuit_id"] for row in rows}
    assert "monaco" in ids


def test_models_manifest_empty_or_present(client):
    r = client.get("/api/models")
    assert r.status_code == 200
    body = r.json()
    assert "targets" in body

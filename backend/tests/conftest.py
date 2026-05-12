import os
import importlib
from pathlib import Path
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path):
    db_file = tmp_path / "test_istore.db"
    os.environ["APP_ENV"] = "development"
    os.environ["SQLITE_FILE"] = str(db_file)
    os.environ["SQLITE_URL"] = f"sqlite:///{db_file.as_posix()}"
    os.environ["BACKUP_FOLDER"] = str(tmp_path / "backups")
    os.environ["SECRET_KEY"] = "test-secret-key"
    os.environ["CORS_ORIGINS"] = "http://localhost:5173"

    import app.config
    import app.database
    import app.main
    importlib.reload(app.config)
    importlib.reload(app.database)
    importlib.reload(app.main)

    with TestClient(app.main.app) as tc:
        yield tc


@pytest.fixture()
def auth_headers(client: TestClient):
    resp = client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin123"},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

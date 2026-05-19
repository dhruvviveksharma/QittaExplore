"""Pytest config: makes `from run import app` work regardless of CWD.

The Flask app's blueprints reach into services that depend on env vars
set in .env. Tests don't need real values for those; we stub them out
before importing run, so production code (services/llm.py,
services/study_service.py, routes/search.py) stays free of test-only
fallbacks. Production runs supply real values via systemd EnvironmentFile
or the dev start_barnacle.sh script.
"""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Set BEFORE importing run, since services/llm.py reads these at import time.
os.environ.setdefault("JWT_SECRET", "test")
os.environ.setdefault("ADMIN_PASS", "test")
os.environ.setdefault("API_KEY", "sk-test-pytest-placeholder")
os.environ.setdefault("DIRECTORY", "/tmp")

import pytest
from run import app as flask_app


@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c

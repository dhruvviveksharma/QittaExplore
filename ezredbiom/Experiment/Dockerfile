# syntax=docker/dockerfile:1.6
# ezredbiom production image
# Stage A: compile JSX → app.compiled.js with Babel.
# Stage B: Python runtime with qiita-spots + gunicorn.

# ─────────────────────────────────────────────────────────────────────────────
# Stage A — Frontend build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build

# Install babel toolchain (matches start_barnacle.sh).
RUN npm install --silent --no-audit --no-fund \
      @babel/cli@7 @babel/core@7 \
      @babel/preset-react@7 @babel/preset-env@7

# Copy frontend sources (paths relative to repo root build context).
COPY ezredbiom/Experiment/frontend/ ./frontend/

# Compile JSX.
RUN ./node_modules/.bin/babel ./frontend/app.js \
      --presets @babel/preset-react,@babel/preset-env \
      -o ./frontend/app.compiled.js

# Rewrite the dev API base in index.html so the deployed frontend uses
# same-origin /api (nginx proxies /api → app:5001).
# Source files in the repo are NOT modified — this only edits the build copy.
RUN sed -i 's|http://localhost:5001/api|/api|g' ./frontend/index.html

# ─────────────────────────────────────────────────────────────────────────────
# Stage B — Python runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.9-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps: psycopg2 build, git for editable qiita-spots install,
# build-essential for any C extensions in scientific deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      gcc \
      libpq-dev \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for layer caching.
COPY ezredbiom/Experiment/requirements.prod.txt /app/requirements.prod.txt
RUN pip install --upgrade pip setuptools wheel && \
    pip install -r /app/requirements.prod.txt

# Copy backend source.
COPY ezredbiom/Experiment/backend/ /app/backend/

# Copy compiled frontend from Stage A.
COPY --from=frontend /build/frontend/ /app/frontend/

# Production scripts/configs.
COPY ezredbiom/Experiment/start_prod.sh /app/start_prod.sh
COPY ezredbiom/Experiment/gunicorn_conf.py /app/gunicorn_conf.py
RUN chmod +x /app/start_prod.sh

# SQLite store lives on a mounted volume in production.
RUN mkdir -p /var/lib/ezredbiom

EXPOSE 5001

CMD ["/app/start_prod.sh"]

#!/usr/bin/env bash
# Production entrypoint for the ezredbiom container.
# Replaces start_barnacle.sh — no conda, no babel (built into image), no
# hardcoded paths.

set -euo pipefail

# Required env vars — fail fast with a clear message if missing.
: "${API_KEY:?API_KEY env var required (NRP-Nautilus LLM token)}"
: "${QIITA_CONFIG_FP:?QIITA_CONFIG_FP env var required (path to qiita_config.cfg)}"

if [ ! -r "${QIITA_CONFIG_FP}" ]; then
  echo "FATAL: QIITA_CONFIG_FP=${QIITA_CONFIG_FP} is not readable." >&2
  exit 1
fi

# SQLite store path (defaults to a docker-volume-mounted location).
export QIITA_EXPERIMENT_DB_PATH="${QIITA_EXPERIMENT_DB_PATH:-/var/lib/ezredbiom/projects.db}"
mkdir -p "$(dirname "${QIITA_EXPERIMENT_DB_PATH}")"

echo "[start_prod] QIITA_CONFIG_FP=${QIITA_CONFIG_FP}"
echo "[start_prod] QIITA_EXPERIMENT_DB_PATH=${QIITA_EXPERIMENT_DB_PATH}"
echo "[start_prod] Launching gunicorn on 0.0.0.0:5001..."

cd /app/backend
exec gunicorn -c /app/gunicorn_conf.py "run:app"

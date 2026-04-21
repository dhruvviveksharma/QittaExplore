#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate qiita-web

# Point Qiita at the repo's config file (has correct qiita-db-rc credentials)
export QIITA_CONFIG_FP="${QIITA_CONFIG_FP:-$SCRIPT_DIR/../qiita_config.cfg}"

export QIITA_EXPERIMENT_DB_PATH="${QIITA_EXPERIMENT_DB_PATH:-$HOME/.qiita-experiment/projects.db}"
mkdir -p "$(dirname "$QIITA_EXPERIMENT_DB_PATH")"

# ── Auth / server config ──────────────────────────────────────────────────────
export JWT_SECRET="${JWT_SECRET:-change-me-in-production}"
export ADMIN_USER="${ADMIN_USER:-admin}"

if [ -z "${ADMIN_PASS:-}" ]; then
  echo "ERROR: ADMIN_PASS must be set (e.g. export ADMIN_PASS=yourpassword)"
  exit 1
fi

if [ "$JWT_SECRET" = "change-me-in-production" ]; then
  echo "WARNING: JWT_SECRET is using the default value — generate one with: openssl rand -hex 32"
fi

echo "Starting Gunicorn on port ${PORT:-5001} (${GUNICORN_WORKERS:-4} workers)..."
exec gunicorn run:app \
  --worker-class gevent \
  --workers "${GUNICORN_WORKERS:-4}" \
  --bind "0.0.0.0:${PORT:-5001}" \
  --timeout 300 \
  --keep-alive 5 \
  --log-level info

#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate qiita-web

# Point Qiita at the repo's config file (has correct qiita-db-rc credentials)
export QIITA_CONFIG_FP="/home/d4sharma/qiita-web/qiita_config.cfg"

# Bridge to PR #3's services/study_service.py, which uses raw psycopg2
# instead of qiita_db.TRN and reads connection params from PG_* env vars.
# Extract them from the [postgres] section of QIITA_CONFIG_FP so the
# secret stays in one place (already the source of truth for Qiita).
while IFS='=' read -r k v; do
    [[ -n "$k" ]] && export "$k=$v"
done < <(python <<'EOF_PYTHON'
import configparser, os
c = configparser.ConfigParser()
c.read(os.environ["QIITA_CONFIG_FP"])
pg = c["postgres"]
print(f"PG_HOST={pg['HOST']}")
print(f"PG_PORT={pg['PORT']}")
print(f"PG_DATABASE={pg['DATABASE']}")
print(f"PG_USER={pg['USER']}")
print(f"PG_PASSWORD={pg['PASSWORD']}")
EOF_PYTHON
)

export QIITA_EXPERIMENT_DB_PATH="${QIITA_EXPERIMENT_DB_PATH:-$HOME/.qiita-experiment/projects.db}"
mkdir -p "$(dirname "$QIITA_EXPERIMENT_DB_PATH")"

echo "Frontend uses Babel standalone (runtime transpilation) — no compile step needed."

cd "$SCRIPT_DIR/backend"
echo "Starting gunicorn on port 5001 (4 workers, 2 threads each)..."
exec gunicorn -w 4 --threads 2 -b 0.0.0.0:5001 \
  --timeout 120 --graceful-timeout 30 \
  --worker-class gthread \
  --log-level info \
  run:app

#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate qiita-web

# Point Qiita at the repo's config file (has correct qiita-db-rc credentials)
export QIITA_CONFIG_FP="/home/d4sharma/qiita-web/qiita_config.cfg"

export QIITA_EXPERIMENT_DB_PATH="${QIITA_EXPERIMENT_DB_PATH:-$HOME/.qiita-experiment/projects.db}"
mkdir -p "$(dirname "$QIITA_EXPERIMENT_DB_PATH")"

echo "Compiling frontend JSX..."
cd "$SCRIPT_DIR/frontend"
npx --yes @babel/cli@7 \
    --presets @babel/preset-react,@babel/preset-env \
    app.js -o app.compiled.js 2>/dev/null \
  && echo "Frontend compiled." \
  || echo "Warning: Babel compile failed, browser will fall back to runtime transpilation."

cd "$SCRIPT_DIR/backend"
echo "Starting Flask dev server on port 5001..."
python run.py

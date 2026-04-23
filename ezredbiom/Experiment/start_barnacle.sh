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
# Install babel tools locally on first run (cached in node_modules after that)
if [ ! -f node_modules/.bin/babel ]; then
  echo "  Installing Babel (first run only)..."
  # Create a minimal package.json if one doesn't exist
  [ -f package.json ] || echo '{"name":"qiita-frontend","private":true}' > package.json
  npm install --save-dev \
    @babel/cli@7 @babel/core@7 \
    @babel/preset-react@7 @babel/preset-env@7 || true
fi
if [ -f node_modules/.bin/babel ]; then
  node_modules/.bin/babel app.js \
    --presets @babel/preset-react,@babel/preset-env \
    -o app.compiled.js \
    && echo "Frontend compiled." \
    || echo "Warning: Babel compile failed, browser will fall back to runtime transpilation."
else
  echo "Warning: Babel not available, browser will fall back to runtime transpilation."
fi

cd "$SCRIPT_DIR/backend"
echo "Starting Flask dev server on port 5001..."
python run.py

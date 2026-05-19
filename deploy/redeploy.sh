#!/usr/bin/env bash
set -euo pipefail

# Redeploys QittaExplore on barnacle2 from kl-remote.
#  1. SSH (sync) to pull origin/master and kill any running listener.
#  2. ssh -f to launch start_barnacle.sh detached (ssh forks; remote runs
#     under sshd, fully decoupled from this script).
#  3. Poll :5001 locally via the existing SSH -L tunnel to verify the app
#     comes back up.

LOG_FILE="${LOG_FILE:-$HOME/qiita-deploy/redeploy.log}"
BARNACLE_HOST="${BARNACLE_HOST:-d4sharma@barnacle2.ucsd.edu}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15)

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf '[%s] %s\n' "$(ts)" "$*" | tee -a "$LOG_FILE"; }

# Port probe against the SSH -L 5001:localhost:5001 tunnel
# (qiita-barnacle-tunnel.service). A bare TCP connect is NOT enough: ssh -L
# accepts the local-side handshake even when the remote has no listener,
# so we curl through the tunnel and require any HTTP response.
port_up() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
           http://127.0.0.1:5001/ 2>/dev/null)
  [[ "$code" != "000" && -n "$code" ]]
}

mkdir -p "$(dirname "$LOG_FILE")"
log "redeploy start (commit=${GIT_AFTER_SHA:-unknown})"

# -- step 0: refresh the frontend checkout on kl-remote -----------------------
# nginx (docker, qiita-nginx) bind-mounts this directory and serves it as `/`.
# Files are picked up immediately; no container restart needed.
FRONTEND_REPO="$HOME/qiita-deploy/frontend-repo"
if [[ -d "$FRONTEND_REPO/.git" ]]; then
  log "refreshing frontend at $FRONTEND_REPO"
  # Explicit refspec: some git versions only update FETCH_HEAD (not
  # refs/remotes/origin/master) when given `fetch origin <branch>`.
  git -C "$FRONTEND_REPO" fetch --quiet origin '+refs/heads/master:refs/remotes/origin/master'
  git -C "$FRONTEND_REPO" reset --hard origin/master >/dev/null
  log "frontend now at $(git -C "$FRONTEND_REPO" rev-parse --short HEAD)"
else
  log "WARN: frontend repo missing at $FRONTEND_REPO — skipping frontend refresh"
fi

# Tag the ssh -f client so we can find and clean it up later. The launched
# remote process is nohup'd, so it survives this client being killed.
SSHF_TAG="qiita-deploy-launcher-$$"

# Clean up any stale launcher clients from previous deploys.
pkill -f "ssh -f .*${SSHF_TAG%-*}-" 2>/dev/null || true

# -- step 1: pull + kill (synchronous) ----------------------------------------
ssh "${SSH_OPTS[@]}" "$BARNACLE_HOST" "bash -s" <<'REMOTE'
set -euo pipefail
cd "$HOME/qiita-web"
# Explicit refspec — older git versions (e.g. barnacle2) only update
# FETCH_HEAD when given `fetch origin <branch>`, leaving
# refs/remotes/origin/master stale and `reset --hard origin/master` no-ops.
git fetch --quiet origin '+refs/heads/master:refs/remotes/origin/master'
git reset --hard origin/master
echo "remote: now at $(git rev-parse HEAD)"

# Kill the launcher + whatever it spawned (gunicorn or python run.py).
# `|| true` because pkill exits non-zero when nothing matches, which is normal.
pkill -TERM -f 'start_barnacle.sh'    2>/dev/null || true
pkill -TERM -f 'gunicorn .* run:app'  2>/dev/null || true
pkill -TERM -f 'python run\.py'       2>/dev/null || true
sleep 3
pkill -KILL -f 'start_barnacle.sh'    2>/dev/null || true
pkill -KILL -f 'gunicorn .* run:app'  2>/dev/null || true
pkill -KILL -f 'python run\.py'       2>/dev/null || true
echo "remote: killed prior listeners"
REMOTE

# -- step 2: launch (detached via ssh -f) -------------------------------------
log "launching start_barnacle.sh on barnacle2 (ssh -f)"
# ssh -f forks the ssh client into the background after auth. The forked
# client lingers as long as the (long-running) remote command runs; step 4
# kills it. The remote command is `nohup`'d so the child survives that.
# `: $SSHF_TAG` is a no-op `:` builtin that puts the tag in the ssh client's
# argv so we can find this specific client with pkill -f later.
REMOTE_CMD=': '"$SSHF_TAG"'; export PATH="$HOME/miniconda3/bin:/usr/sbin:$PATH"; cd "$HOME/qiita-web/ezredbiom/Experiment" && exec nohup ./start_barnacle.sh < /dev/null >> "$HOME/qiita-web/qiita-app.log" 2>&1'
ssh -f "${SSH_OPTS[@]}" "$BARNACLE_HOST" "$REMOTE_CMD" \
  < /dev/null > /dev/null 2>&1

# -- step 3: verify via the local SSH -L tunnel -------------------------------
log "waiting for :5001 to listen (via local tunnel)"
rc=1
for i in $(seq 1 90); do
  if port_up; then
    log "redeploy ok — port :5001 up after ${i}s"
    rc=0
    break
  fi
  sleep 1
done

# -- step 4: detach the local ssh -f client -----------------------------------
# nohup on barnacle2 keeps the remote process alive after this kill.
pkill -f "ssh -f .*$SSHF_TAG" 2>/dev/null || true

if [[ $rc -ne 0 ]]; then
  log "redeploy FAILED — :5001 still down after 90s"
fi
exit $rc

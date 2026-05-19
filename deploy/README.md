# deploy/

Production deployment artifacts for QittaExplore. The application itself
lives at the repo root; this directory holds everything that turns a
fresh push to `master` into a running service on the public URL.

```
                            cloudflared.service (systemd --user)
                                    │
                                    ▼ (named tunnel "qiita-explore" → two hostnames)
   qiita-deploy.knight-lab-dev.org   qiita-explore.knight-lab-dev.org
            │                                   │
            ▼                                   ▼
   GitHub Webhook                      qiita-nginx (docker, host-net, :8081)
   POST /webhook (HMAC-SHA256)         ├─ /        → static frontend
            │                          │            (bind-mounted from a
            ▼                          │             checkout of this repo)
   qiita-deploy-webhook.service        └─ /api/    → proxy_pass 127.0.0.1:5001
   webhook.py (127.0.0.1:9001)                              │
            │                                               ▼ SSH -L tunnel
            ▼ subprocess                       qiita-barnacle-tunnel.service
   redeploy.sh                                 ssh -N -L 5001:localhost:5001
   ├─ git -C frontend-repo reset --hard origin/master    barnacle2.ucsd.edu
   │   (nginx serves the new files on next request --      (gunicorn / flask
   │    bind-mount means no container restart needed)       app, started by
   ├─ ssh barnacle2: cd ~/qiita-web && git reset           ezredbiom/Experiment/
   │                 --hard origin/master                  start_barnacle.sh)
   ├─ ssh barnacle2: pkill old gunicorn / start_barnacle.sh
   └─ ssh -f barnacle2: nohup start_barnacle.sh &
              (redeploy.sh polls :5001 via the tunnel until
               the new flask comes up; logs to redeploy.log)
```

The host running everything in this diagram (call it the *deploy host*)
must reach `barnacle2.ucsd.edu` over ssh and the public internet via
the `cloudflared` daemon. It does **not** need to run the Flask app
itself; that lives on barnacle2 because of the Qiita conda env + DB
access requirements.

> **Two hostnames, one tunnel.** A single `cloudflared` daemon
> publishes the deploy host on two CNAMEs and routes each to a
> different local port via `~/.cloudflared/config.yml`:
>
> | Public hostname | Local target | What lives there |
> |---|---|---|
> | `qiita-explore.knight-lab-dev.org` | `127.0.0.1:8081` | nginx → static frontend + `/api/` proxy to Flask |
> | `qiita-deploy.knight-lab-dev.org`  | `127.0.0.1:9001` | `webhook.py` (GitHub deliveries land here) |
>
> The GitHub webhook **must** point at `qiita-deploy.*` — `qiita-explore.*`
> goes to nginx, which has no `/webhook` location and will silently swallow
> the delivery as a static-file 200 (or a Cloudflare redirect on POST).

## Components

| File | What it is | Where it runs |
|---|---|---|
| `webhook.py` | GitHub-webhook receiver (`POST /webhook`, HMAC-SHA256). On `push` to `refs/heads/master`, spawns `redeploy.sh` in a worker thread and 202s back to GitHub within its 10s deadline. Coalesces overlapping pushes. | deploy host, via `qiita-deploy-webhook.service` (loopback `:9001`) |
| `redeploy.sh` | Front + back redeploy. Refreshes the local frontend checkout via `git reset --hard origin/master`, SSHes to barnacle2 to refresh `~/qiita-web`, kills the old gunicorn/python, ssh-f-launches `start_barnacle.sh` detached, polls `:5001` through the local tunnel until the new app answers. | deploy host (called by webhook.py) |
| `nginx/nginx.conf` | Production nginx — listens on `:8081`, gzip+SSE-friendly proxy for `/api/`, static for `/`, `sub_filter` rewrites the hardcoded `http://localhost:5001/api` in the served HTML to same-origin `/api`. | inside `qiita-nginx` docker container on deploy host |
| `nginx/docker-compose.yml` | Pins `nginx:alpine`, bind-mounts `nginx.conf` + the frontend checkout, host networking so nginx reaches the barnacle SSH tunnel on `127.0.0.1:5001`. | deploy host |
| `systemd/qiita-barnacle-tunnel.service` | `ssh -N -L 5001:localhost:5001 d4sharma@barnacle2.ucsd.edu`. Restart on failure. | deploy host (`--user` unit) |
| `systemd/qiita-deploy-webhook.service` | Runs `webhook.py` bound to `127.0.0.1:9001`. Public exposure is via cloudflared, not direct port-binding. | deploy host (`--user` unit) |
| `systemd/cloudflared.service` | Runs the named Cloudflare Tunnel `qiita-explore`. Routes `qiita-explore.knight-lab-dev.org` to the local nginx on `:8081` and `qiita-deploy.knight-lab-dev.org` to the webhook listener on `:9001`. | deploy host (`--user` unit) |

The dedicated frontend checkout lives at `$HOME/qiita-deploy/frontend-repo`
on the deploy host (override via editing `redeploy.sh`'s `FRONTEND_REPO`).
It is intentionally a separate clone from any dev workspace so the
agent driving redeploys never collides with a human's working tree.

## Cold-start

On a fresh deploy host (Debian/Ubuntu-like, docker + docker-compose-v2
present, `sudo loginctl enable-linger $USER` already run):

```bash
# 1. Stage the layout this repo expects.
mkdir -p ~/qiita-deploy/nginx ~/qiita-deploy/frontend-repo
git clone https://github.com/dhruvviveksharma/QittaExplore.git \
    ~/qiita-deploy/frontend-repo

# 2. Drop the production nginx config + compose into place.
cp ~/qiita-deploy/frontend-repo/deploy/nginx/nginx.conf      ~/qiita-deploy/nginx/
cp ~/qiita-deploy/frontend-repo/deploy/nginx/docker-compose.yml ~/qiita-deploy/nginx/

# 3. Drop redeploy.sh + webhook.py into place.
cp ~/qiita-deploy/frontend-repo/deploy/redeploy.sh ~/qiita-deploy/
cp ~/qiita-deploy/frontend-repo/deploy/webhook.py  ~/qiita-deploy/
chmod 755 ~/qiita-deploy/redeploy.sh ~/qiita-deploy/webhook.py

# 4. Install the user systemd units.
mkdir -p ~/.config/systemd/user
cp ~/qiita-deploy/frontend-repo/deploy/systemd/*.service ~/.config/systemd/user/
systemctl --user daemon-reload

# 5. Bring up the nginx container.
cd ~/qiita-deploy/nginx && docker compose up -d
```

After this, the four `--user` units (`qiita-barnacle-tunnel`,
`qiita-deploy-webhook`, `cloudflared`) are installed but inert until
the credential-shaped steps below are done.

## Credential-shaped manual steps

1. **SSH access to barnacle2.** Generate a keypair on the deploy host
   and add the public side to `~/.ssh/authorized_keys` on barnacle2 for
   the `d4sharma` user. Verify with `ssh d4sharma@barnacle2.ucsd.edu echo ok`.
   Override the host with `Environment=BARNACLE_HOST=…` in
   `qiita-barnacle-tunnel.service` if you're not using `barnacle2.ucsd.edu`.

2. **Webhook secret.** Generate a random secret and put it in two places —
   the deploy host and the GitHub webhook config — *exactly* matching:
   ```bash
   openssl rand -hex 32 > ~/qiita-deploy/webhook.secret
   chmod 600 ~/qiita-deploy/webhook.secret
   ```
   Then in GitHub → repo Settings → Webhooks → Add webhook:
   - Payload URL: `https://qiita-deploy.knight-lab-dev.org/webhook`
     (this is the **webhook** hostname — *not* `qiita-explore.*`, which
     routes to nginx; see "Two hostnames, one tunnel" above)
   - Content type: `application/json`
   - Secret: paste the contents of `webhook.secret`
   - Events: just `push`

3. **Cloudflare named tunnel.** On the deploy host:
   ```bash
   ~/.local/bin/cloudflared tunnel login            # OAuths the browser
   ~/.local/bin/cloudflared tunnel create qiita-explore
   # Both hostnames are CNAMEd to the same tunnel; cloudflared
   # picks the local target per hostname via config.yml below.
   ~/.local/bin/cloudflared tunnel route dns qiita-explore qiita-explore.knight-lab-dev.org
   ~/.local/bin/cloudflared tunnel route dns qiita-explore qiita-deploy.knight-lab-dev.org
   ```

   Then `~/.cloudflared/config.yml` should look like:
   ```yaml
   tunnel: qiita-explore
   credentials-file: /home/<user>/.cloudflared/<tunnel-uuid>.json

   ingress:
     - hostname: qiita-explore.knight-lab-dev.org
       service: http://localhost:8081     # nginx → frontend + /api/
     - hostname: qiita-deploy.knight-lab-dev.org
       service: http://localhost:9001     # webhook.py (GitHub deliveries)
     - service: http_status:404
   ```

4. **Enable + start the units.**
   ```bash
   systemctl --user enable --now \
       qiita-barnacle-tunnel.service \
       qiita-deploy-webhook.service \
       cloudflared.service
   ```

5. **Smoke test.** From the deploy host:
   ```bash
   curl -fsS http://localhost:5001/ || echo "barnacle backend not running yet"
   curl -fsS http://localhost:8081/ | head -5    # frontend via nginx
   curl -fsS http://localhost:9001/healthz       # webhook listener
   ```
   Then trigger a redeploy from GitHub's webhook → "Recent Deliveries"
   → "Redeliver" to verify the round trip.

## Operational reference

| Component | Inspect logs |
|---|---|
| webhook listener | `journalctl --user -u qiita-deploy-webhook.service -f` |
| webhook events (HTTP-level) | `tail -f ~/qiita-deploy/webhook.log` |
| each redeploy run | `tail -f ~/qiita-deploy/redeploy.log` |
| barnacle ssh tunnel | `journalctl --user -u qiita-barnacle-tunnel.service -f` |
| cloudflared tunnel | `journalctl --user -u cloudflared.service -f` |
| nginx | `docker logs -f qiita-nginx` |
| flask app on barnacle | `ssh d4sharma@barnacle2 tail -f ~/qiita-web/qiita-app.log` |

| Action | Command |
|---|---|
| manual redeploy | `GIT_AFTER_SHA=manual ~/qiita-deploy/redeploy.sh` |
| reset frontend checkout | `cd ~/qiita-deploy/frontend-repo && git fetch && git reset --hard origin/master` |
| recreate nginx | `cd ~/qiita-deploy/nginx && docker compose up -d --force-recreate` |
| restart all user units | `systemctl --user restart qiita-barnacle-tunnel qiita-deploy-webhook cloudflared` |

## Troubleshooting

**Pushes to `master` are not triggering a redeploy.**

1. Tail `~/qiita-deploy/webhook.log`. If you see only `ping ok` entries
   and zero lines mentioning `accepted push`, GitHub deliveries are not
   reaching `webhook.py` at all.
2. Check the GitHub webhook's "Recent Deliveries" page. If deliveries
   show `200` but with an HTML body or a Cloudflare `302`, the Payload
   URL is pointed at `qiita-explore.knight-lab-dev.org/webhook` (nginx)
   instead of `qiita-deploy.knight-lab-dev.org/webhook` (webhook.py).
   Fix the Payload URL and hit "Redeliver".
3. If deliveries show `401 bad signature`, the secret on the deploy host
   (`~/qiita-deploy/webhook.secret`) does not match the one configured
   in GitHub. Regenerate via the step-2 command and update both sides.
4. From the deploy host, confirm the routing end-to-end:
   ```bash
   curl -fsS https://qiita-deploy.knight-lab-dev.org/healthz   # → "ok"
   curl -i -X POST https://qiita-deploy.knight-lab-dev.org/webhook \
        -H 'X-GitHub-Event: push' --data '{}'                  # → 401 bad signature
   ```
   `Server: qiita-deploy-webhook/1` in the response headers confirms
   the request landed on `webhook.py` and not on nginx or Cloudflare.

**Webhook receives the push but redeploy doesn't run.**
Check `~/qiita-deploy/redeploy.log` for a `redeploy start` entry that
matches the SHA from `webhook.log`. If absent, inspect
`journalctl --user -u qiita-deploy-webhook.service` for a Python
traceback in `run_redeploy`.

## What's intentionally not here

- `webhook.secret` — generated per deploy host (see step 2 above).
- `redeploy.log`, `webhook.log` — runtime, regenerated every run.
- `~/qiita-deploy/frontend-repo/` — a checkout, not source.
- The frontend's *in-repo* `ezredbiom/Experiment/nginx.conf` is a dev
  server-block fragment listening on `:8080`; it is **not** the same
  file as `deploy/nginx/nginx.conf` and isn't a sync target.

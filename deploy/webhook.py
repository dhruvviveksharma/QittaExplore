#!/usr/bin/env python3
"""GitHub webhook receiver -> trigger QittaExplore redeploy.

Verifies X-Hub-Signature-256 (HMAC-SHA256), accepts only push events on
refs/heads/master, and spawns redeploy.sh in the background so we can
acknowledge GitHub within its 10-second delivery timeout.
"""

from __future__ import annotations

import hashlib
import hmac
import http.server
import json
import logging
import os
import socketserver
import subprocess
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

HOME = Path.home()
SECRET_FILE = HOME / "qiita-deploy" / "webhook.secret"
REDEPLOY_SCRIPT = HOME / "qiita-deploy" / "redeploy.sh"
EVENT_LOG = HOME / "qiita-deploy" / "webhook.log"
REDEPLOY_LOG = HOME / "qiita-deploy" / "redeploy.log"

LISTEN_HOST = os.environ.get("WEBHOOK_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("WEBHOOK_PORT", "9001"))
TARGET_REF = "refs/heads/master"

# Only one redeploy at a time; concurrent pushes coalesce to "redeploy again".
_redeploy_lock = threading.Lock()
_redeploy_pending = threading.Event()


def setup_logging() -> logging.Logger:
    EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("qiita-deploy-webhook")
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(EVENT_LOG, maxBytes=1_000_000, backupCount=3)
    handler.setFormatter(logging.Formatter("%(asctime)sZ %(levelname)s %(message)s"))
    logger.addHandler(handler)
    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(logging.Formatter("%(asctime)sZ %(levelname)s %(message)s"))
    logger.addHandler(stream)
    return logger


log = setup_logging()


def load_secret() -> bytes:
    if not SECRET_FILE.exists():
        log.error("missing secret file %s", SECRET_FILE)
        sys.exit(1)
    secret = SECRET_FILE.read_text().strip()
    if not secret:
        log.error("secret file %s is empty", SECRET_FILE)
        sys.exit(1)
    return secret.encode()


SECRET = load_secret()


def signature_valid(body: bytes, header: str | None) -> bool:
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(SECRET, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.split("=", 1)[1])


def run_redeploy(after_sha: str) -> None:
    """Run redeploy.sh, coalescing overlapping requests."""
    _redeploy_pending.set()
    if not _redeploy_lock.acquire(blocking=False):
        log.info("redeploy already running; queued (sha=%s)", after_sha[:8])
        return
    try:
        while _redeploy_pending.is_set():
            _redeploy_pending.clear()
            log.info("starting redeploy (sha=%s)", after_sha[:8])
            env = {**os.environ, "GIT_AFTER_SHA": after_sha}
            try:
                with REDEPLOY_LOG.open("a") as out:
                    proc = subprocess.run(
                        [str(REDEPLOY_SCRIPT)],
                        stdout=out,
                        stderr=subprocess.STDOUT,
                        env=env,
                        check=False,
                    )
                log.info("redeploy finished rc=%d", proc.returncode)
            except Exception:
                log.exception("redeploy crashed")
    finally:
        _redeploy_lock.release()


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "qiita-deploy-webhook/1"

    def log_message(self, fmt: str, *args) -> None:
        log.info("http %s - %s", self.address_string(), fmt % args)

    def _reply(self, code: int, body: str) -> None:
        data = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._reply(200, "ok\n")
            return
        self._reply(404, "not found\n")

    def do_POST(self) -> None:
        if self.path != "/webhook":
            self._reply(404, "not found\n")
            return

        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > 5_000_000:
            self._reply(400, "bad length\n")
            return
        body = self.rfile.read(length)

        sig = self.headers.get("X-Hub-Signature-256")
        if not signature_valid(body, sig):
            log.warning("rejected: bad signature from %s", self.address_string())
            self._reply(401, "bad signature\n")
            return

        event = self.headers.get("X-GitHub-Event", "")
        delivery = self.headers.get("X-GitHub-Delivery", "")

        if event == "ping":
            log.info("ping ok delivery=%s", delivery)
            self._reply(200, "pong\n")
            return

        if event != "push":
            log.info("ignoring event=%s delivery=%s", event, delivery)
            self._reply(202, "ignored\n")
            return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._reply(400, "bad json\n")
            return

        ref = payload.get("ref", "")
        after = payload.get("after", "")
        if ref != TARGET_REF:
            log.info("ignoring ref=%s delivery=%s", ref, delivery)
            self._reply(202, "wrong ref\n")
            return

        log.info("accepted push ref=%s sha=%s delivery=%s", ref, after[:8], delivery)
        threading.Thread(target=run_redeploy, args=(after,), daemon=True).start()
        self._reply(202, "redeploy queued\n")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    if not REDEPLOY_SCRIPT.exists():
        log.error("redeploy script not found at %s", REDEPLOY_SCRIPT)
        sys.exit(1)
    log.info("listening on %s:%d", LISTEN_HOST, LISTEN_PORT)
    ThreadedHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()

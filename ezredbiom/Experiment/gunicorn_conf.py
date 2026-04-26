# Gunicorn config for the ezredbiom Flask app.
#
# Threaded workers (gthread) chosen because run.py uses ThreadPoolExecutor and
# the LLM streaming endpoints (stream_with_context) hold connections open for
# tens of seconds. Pure sync workers would cause head-of-line blocking.

bind = "0.0.0.0:5001"
workers = 4
worker_class = "gthread"
threads = 4

# LLM streams can be slow; allow a generous timeout.
timeout = 120
graceful_timeout = 30
keepalive = 5

# Log to stdout/stderr so docker logs picks them up.
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Don't preload the app: qiita_db opens DB connections at import time and
# preloading would share them across forked workers.
preload_app = False

#!/bin/sh
# Docker HEALTHCHECK for both roles of the image.
#   web     GET /api/health must return 200 (includes a database check)
#   worker  the worker's heartbeat file must have been touched in the last 2 minutes
#           (a missing file counts as healthy, e.g. right after start)
set -eu

mode="$(cat /tmp/dispatch-mode 2>/dev/null || echo web)"

case "$mode" in
  worker)
    heartbeat="${WORKER_HEARTBEAT_FILE:-/tmp/dispatch-worker.heartbeat}"
    [ -f "$heartbeat" ] || exit 0
    age=$(( $(date +%s) - $(stat -c %Y "$heartbeat") ))
    [ "$age" -lt 120 ] || { echo "worker heartbeat is ${age}s old"; exit 1; }
    ;;
  migrate)
    exit 0
    ;;
  *)
    wget -q -T 4 -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/health"
    ;;
esac

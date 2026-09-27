#!/bin/sh
# Dispatch container entrypoint (runs under tini as the unprivileged `nextjs` user).
#
#   web (default)  apply database migrations, then start the Next.js server
#   worker         apply migrations (waits for the database), then start the background worker
#   migrate        apply migrations and exit
#   <anything>     exec it, e.g. `docker compose run --rm app sh`
#
# Migrations are idempotent and guarded by a Postgres advisory lock, so the app
# and the worker can safely run them at the same time.
set -eu

mode_file=/tmp/dispatch-mode

check_data_dir() {
  dir="${DATA_DIR:-/data}"
  if ! mkdir -p "$dir" 2>/dev/null || [ ! -w "$dir" ]; then
    echo "dispatch: $dir is not writable by uid $(id -u)." >&2
    echo "dispatch: if you bind-mount a host directory, run: chown -R $(id -u):$(id -g) <host-dir>" >&2
    exit 1
  fi
}

migrate() {
  if [ "${SKIP_MIGRATIONS:-}" = "true" ] || [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
    echo "dispatch: SKIP_MIGRATIONS is set, not running migrations"
    return
  fi
  node --enable-source-maps dist/migrate.mjs
}

cmd="${1:-web}"
case "$cmd" in
  web | start | server)
    echo web > "$mode_file"
    check_data_dir
    migrate
    exec node server.js
    ;;
  worker)
    echo worker > "$mode_file"
    check_data_dir
    migrate
    exec node --enable-source-maps dist/worker.mjs
    ;;
  migrate)
    echo migrate > "$mode_file"
    exec node --enable-source-maps dist/migrate.mjs
    ;;
  *)
    exec "$@"
    ;;
esac

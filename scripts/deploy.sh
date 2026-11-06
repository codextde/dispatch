#!/usr/bin/env bash
set -Eeuo pipefail

# Generic deploy for this fork. Builds the image on the target host from the
# pushed tip of a branch, then restarts app + worker via docker compose.
#
#   DISPATCH_DEPLOY_HOST=server1 ./scripts/deploy.sh
#
# Optional overrides (defaults in brackets):
#   DISPATCH_BRANCH        branch to deploy [current branch]
#   DISPATCH_SOURCE_DIR    clean checkout dir on the host [/opt/dispatch-deploy/dispatch]
#   DISPATCH_APP_DIR       compose dir on the host [/opt/dispatch]
#   DISPATCH_IMAGE_REPO    image name [ghcr.io/lsalami/dispatch]
#   DISPATCH_IMAGE_TAG_PREFIX  tag prefix [per-host "deploy"]
#   DISPATCH_HEALTH_URL    health endpoint checked after deploy [none]

REPO_ROOT="$(git rev-parse --show-toplevel)"
BRANCH="${DISPATCH_BRANCH:-$(git -C "$REPO_ROOT" branch --show-current)}"
REPO_URL="$(git -C "$REPO_ROOT" remote get-url origin)"
COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
readonly DEPLOY_HOST="${DISPATCH_DEPLOY_HOST:?Set DISPATCH_DEPLOY_HOST to the SSH host.}"
readonly SOURCE_DIR="${DISPATCH_SOURCE_DIR:-/opt/dispatch-deploy/dispatch}"
readonly APP_DIR="${DISPATCH_APP_DIR:-/opt/dispatch}"
readonly IMAGE_REPO="${DISPATCH_IMAGE_REPO:-ghcr.io/lsalami/dispatch}"
readonly TAG_PREFIX="${DISPATCH_IMAGE_TAG_PREFIX:-deploy}"
readonly HEALTH_URL="${DISPATCH_HEALTH_URL:-}"

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  printf 'Refusing deploy: commit or stash the working tree before deploying.\n' >&2
  exit 1
fi

REMOTE_COMMIT="$(git -C "$REPO_ROOT" ls-remote "$REPO_URL" "refs/heads/$BRANCH" | awk 'NR == 1 { print $1 }')"
if [[ -z "$REMOTE_COMMIT" || "$REMOTE_COMMIT" != "$COMMIT" ]]; then
  printf 'Refusing deploy: local commit %s is not the published tip of %s.\n' "$COMMIT" "$BRANCH" >&2
  exit 1
fi

printf 'Deploying %s at %s to %s…\n' "$BRANCH" "${COMMIT:0:12}" "$DEPLOY_HOST"

ssh "$DEPLOY_HOST" bash -s -- \
  "$REPO_URL" "$BRANCH" "$COMMIT" "$SOURCE_DIR" "$APP_DIR" "$IMAGE_REPO" "$TAG_PREFIX" "$HEALTH_URL" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

repo_url="$1"
branch="$2"
commit="$3"
source_dir="$4"
app_dir="$5"
image_repo="$6"
tag_prefix="$7"
health_url="$8"

mkdir -p "$(dirname "$source_dir")"
if [[ ! -d "$source_dir/.git" ]]; then
  git clone --no-checkout "$repo_url" "$source_dir"
fi

configured_url="$(git -C "$source_dir" remote get-url origin)"
if [[ "$configured_url" != "$repo_url" ]]; then
  printf 'Refusing deploy: %s points to %s, expected %s.\n' "$source_dir" "$configured_url" "$repo_url" >&2
  exit 1
fi

if [[ -n "$(git -C "$source_dir" status --porcelain)" ]]; then
  printf 'Refusing deploy: dedicated source checkout %s has local changes.\n' "$source_dir" >&2
  exit 1
fi

git -C "$source_dir" fetch --prune origin "$branch"
fetched_commit="$(git -C "$source_dir" rev-parse FETCH_HEAD)"
if [[ "$fetched_commit" != "$commit" ]]; then
  printf 'Refusing deploy: remote branch moved during deploy (%s != %s).\n' "$fetched_commit" "$commit" >&2
  exit 1
fi
git -C "$source_dir" checkout --detach "$commit"

if [[ -n "$(git -C "$source_dir" status --porcelain)" ]]; then
  printf 'Refusing deploy: source checkout %s is not clean after checkout.\n' "$source_dir" >&2
  exit 1
fi

tag="${tag_prefix}-${commit:0:12}"
previous_image="$(docker inspect --format '{{.Config.Image}}' dispatch-app-1 2>/dev/null || true)"
docker build -t "$image_repo:$tag" "$source_dir"

if ! (cd "$app_dir" && DISPATCH_VERSION="$tag" docker compose up -d --force-recreate app worker); then
  printf 'Deploy failed while starting the new containers.\n' >&2
  if [[ -n "$previous_image" ]]; then
    previous_tag="${previous_image##*:}"
    (cd "$app_dir" && DISPATCH_VERSION="$previous_tag" docker compose up -d --force-recreate app worker) || true
  fi
  exit 1
fi

if [[ -n "$health_url" ]]; then
  if ! curl --fail --silent --show-error --retry 24 --retry-delay 5 --retry-connrefused --retry-all-errors "$health_url"; then
    printf '\nHealth check failed; restoring the previous image.\n' >&2
    if [[ -n "$previous_image" ]]; then
      previous_tag="${previous_image##*:}"
      (cd "$app_dir" && DISPATCH_VERSION="$previous_tag" docker compose up -d --force-recreate app worker)
      curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused --retry-all-errors "$health_url" || true
    fi
    exit 1
  fi
fi

printf '\nDeployed image: %s:%s\n' "$image_repo" "$tag"
docker compose -f "$app_dir/docker-compose.yml" ps --format '{{.Service}} {{.Image}} {{.State}}'
REMOTE_SCRIPT

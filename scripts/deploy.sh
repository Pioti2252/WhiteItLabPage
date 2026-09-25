#!/usr/bin/env bash
# Build and (re)start the whiteitlab container with automatic rollback.
# Works with code uploaded manually (tar/scp) and with a git checkout.
#   cd /opt/whiteitlab && bash scripts/deploy.sh
#   bash scripts/deploy.sh --rollback     # go back to the previous image by hand
set -euo pipefail

cd "$(dirname "$0")/.."
IMAGE="whiteitlab/web"
NAME="whiteitlab-web"
HEALTH_TIMEOUT=90

log() { printf '\033[1m[deploy]\033[0m %s\n' "$*"; }

restart_on() {  # retag an image as :latest and recreate the container from it
  docker image tag "$1" "$IMAGE:latest"
  docker compose up -d --no-build --force-recreate
}

wait_healthy() {
  local status i
  for ((i = 0; i < HEALTH_TIMEOUT; i += 3)); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NAME" 2>/dev/null || echo missing)
    case "$status" in
      healthy) return 0 ;;
      unhealthy|exited|dead|missing) return 1 ;;
    esac
    sleep 3
  done
  return 1
}

# Everything runs inside main(): bash parses the whole function before running it,
# so `git pull` replacing this very file mid-run can't break the deploy.
main() {
  if [ "${1:-}" = "--rollback" ]; then
    docker image inspect "$IMAGE:prev" >/dev/null 2>&1 || { log "no $IMAGE:prev image to roll back to"; exit 1; }
    log "rolling back to $IMAGE:prev"
    restart_on "$IMAGE:prev"
    wait_healthy && log "rollback OK" || { log "rollback container is not healthy — check: docker compose logs web"; exit 1; }
    exit 0
  fi

  # Sanity checks (cheap, catch the usual first-deploy mistakes)
  [ -f .env ] || { log ".env missing — cp .env.example .env"; exit 1; }
  [ -f secrets/smtp_pass ] || { log "secrets/smtp_pass missing"; exit 1; }

  if [ -d .git ]; then
    log "git checkout detected — pulling"
    # Under sudo, pull as the repo owner: git refuses repos owned by another
    # user ("dubious ownership") and root-owned files would break later pulls.
    local owner
    owner="$(stat -c %U .)"
    if [ "$(id -u)" -eq 0 ] && [ "$owner" != root ]; then
      sudo -u "$owner" git pull --ff-only
    else
      git pull --ff-only
    fi
  fi

  # Keep the currently running image as :prev
  if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
    docker image tag "$IMAGE:latest" "$IMAGE:prev"
    log "current image saved as $IMAGE:prev"
  fi

  log "building (pulling fresh base images for security patches)"
  docker compose build --pull

  log "starting"
  docker compose up -d

  log "waiting for health check (max ${HEALTH_TIMEOUT}s)"
  if wait_healthy; then
    log "OK — $NAME is healthy"
    docker compose ps
    docker image prune -f >/dev/null
    exit 0
  fi

  log "NEW VERSION IS NOT HEALTHY — last logs:"
  docker compose logs --tail 30 web || true
  if docker image inspect "$IMAGE:prev" >/dev/null 2>&1; then
    log "rolling back to the previous image"
    restart_on "$IMAGE:prev"
    wait_healthy && log "rolled back, previous version is running" || log "previous version is not healthy either — check the logs"
  else
    log "no previous image (first deploy) — fix the problem above and run again"
  fi
  exit 1
}

main "$@"

#!/usr/bin/env bash
# Installs the whiteitlab config into the HOST nginx without risking other sites:
#   - detects the layout (sites-available/sites-enabled or conf.d),
#   - writes WEB_PORT from .env into the upstream,
#   - backs up the previous version, runs `nginx -t`, and ROLLS BACK if it fails,
#   - reloads nginx only when the test passes (reload = no downtime for other sites).
#
#   sudo bash scripts/nginx-install.sh bootstrap   # step 1: HTTP only, for the first certificate
#   sudo bash scripts/nginx-install.sh final       # step 2: full HTTPS config (needs the certificate)
set -euo pipefail

MODE="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/nginx"
DOMAIN="whiteitlab.pl"
BACKUP_DIR="/etc/nginx/whiteitlab-backups"   # outside any include path

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
case "$MODE" in bootstrap|final) ;; *) echo "Usage: sudo bash $0 bootstrap|final"; exit 1 ;; esac

PORT="$(grep -E '^WEB_PORT=' "$ROOT/.env" 2>/dev/null | cut -d= -f2 | tr -d '"'"'"' ')"
PORT="${PORT:-8080}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "Invalid WEB_PORT: $PORT"; exit 1; }

# Layout detection
if grep -Rqs 'sites-enabled' /etc/nginx/nginx.conf; then
  TARGET=/etc/nginx/sites-available/whiteitlab.conf
  LINK=/etc/nginx/sites-enabled/whiteitlab.conf
else
  TARGET=/etc/nginx/conf.d/whiteitlab.conf
  LINK=""
fi
echo "nginx layout -> $TARGET ${LINK:+(+ symlink $LINK)} | upstream 127.0.0.1:$PORT | mode: $MODE"

if [ "$MODE" = final ] && [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "No certificate in /etc/letsencrypt/live/$DOMAIN/ — run certbot first (see docs/DEPLOYMENT.md)."
  exit 1
fi

# Backup of whatever is there now
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
[ -f "$TARGET" ] && cp -a "$TARGET" "$BACKUP_DIR/whiteitlab.conf.$STAMP"
SNIPPET=/etc/nginx/snippets/whiteitlab-tls.conf
[ -f "$SNIPPET" ] && cp -a "$SNIPPET" "$BACKUP_DIR/whiteitlab-tls.conf.$STAMP"

rollback() {
  echo "!! nginx -t FAILED — restoring the previous state, nginx NOT reloaded."
  if [ -f "$BACKUP_DIR/whiteitlab.conf.$STAMP" ]; then cp -a "$BACKUP_DIR/whiteitlab.conf.$STAMP" "$TARGET"
  else rm -f "$TARGET"; [ -n "$LINK" ] && rm -f "$LINK"; fi
  if [ -f "$BACKUP_DIR/whiteitlab-tls.conf.$STAMP" ]; then cp -a "$BACKUP_DIR/whiteitlab-tls.conf.$STAMP" "$SNIPPET"
  elif [ "$MODE" = final ]; then rm -f "$SNIPPET"; fi
  nginx -t >/dev/null 2>&1 && echo "Previous config restored and valid." || echo "WARNING: config still invalid — check: nginx -t"
  exit 1
}

mkdir -p /var/www/certbot
if [ "$MODE" = bootstrap ]; then
  install -m 644 "$SRC/whiteitlab-bootstrap.conf" "$TARGET"
else
  mkdir -p /etc/nginx/snippets
  install -m 644 "$SRC/whiteitlab-tls.conf" "$SNIPPET"
  sed "s/server 127\.0\.0\.1:8080;/server 127.0.0.1:${PORT};/" "$SRC/whiteitlab.conf" > "$TARGET"
  chmod 644 "$TARGET"
fi
# No IPv6 on this host -> "listen [::]:..." would make nginx -t fail. Drop those lines.
if [ ! -f /proc/net/if_inet6 ]; then
  sed -i '/listen \[::\]:/d' "$TARGET"
  echo "IPv6 not available — removed 'listen [::]' lines"
fi
[ -n "$LINK" ] && ln -sfn "$TARGET" "$LINK"

if nginx -t; then
  systemctl reload nginx
  echo "OK: nginx reloaded with the $MODE config. Backup: $BACKUP_DIR/*.$STAMP"
else
  rollback
fi

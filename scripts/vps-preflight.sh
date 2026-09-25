#!/usr/bin/env bash
# Read-only checks before deploying whiteitlab on a VPS that already runs
# other containers and a host nginx. Changes NOTHING on the system.
#   sudo bash scripts/vps-preflight.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="whiteitlab.pl"
PORT="$(grep -E '^WEB_PORT=' "$ROOT/.env" 2>/dev/null | cut -d= -f2 | tr -d '"'"'"' ')"
PORT="${PORT:-8080}"

ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; WARN=$((WARN + 1)); }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
WARN=0; FAIL=0

echo "== System"
. /etc/os-release 2>/dev/null && ok "$PRETTY_NAME"
avail=$(df -Pm "$ROOT" | awk 'NR==2 {print $4}')
[ "${avail:-0}" -ge 2048 ] && ok "free disk: ${avail} MB" || warn "free disk: ${avail} MB (build needs ~1–2 GB temporarily)"

echo "== Docker"
if command -v docker >/dev/null; then
  ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?')"
  docker compose version >/dev/null 2>&1 && ok "$(docker compose version)" || bad "no 'docker compose' (v2 plugin) — install docker-compose-plugin"
  docker buildx version >/dev/null 2>&1 && ok "buildx present (BuildKit, needed for COPY --chmod)" || warn "buildx missing — install docker-buildx-plugin"
  if docker ps -a --format '{{.Names}}' | grep -qx 'whiteitlab-web'; then
    warn "container 'whiteitlab-web' already exists (fine if this is an update)"
  else
    ok "container name 'whiteitlab-web' is free"
  fi
else
  bad "docker not found"
fi

echo "== Port 127.0.0.1:${PORT} (WEB_PORT)"
if ss -ltnH "( sport = :${PORT} )" 2>/dev/null | grep -q .; then
  owner=$(ss -ltnpH "( sport = :${PORT} )" 2>/dev/null | sed -E 's/.*users:\(\("([^"]+)".*/\1/' | head -1)
  if docker ps --format '{{.Names}} {{.Ports}}' | grep -q "whiteitlab-web.*:${PORT}->"; then
    ok "port ${PORT} is used by whiteitlab-web itself (update)"
  else
    bad "port ${PORT} is TAKEN (by: ${owner:-unknown}). Set another WEB_PORT in .env, e.g. 8090"
  fi
else
  ok "port ${PORT} is free"
fi

echo "== nginx (host)"
if command -v nginx >/dev/null; then
  ok "$(nginx -v 2>&1)"
  if grep -Rqs 'sites-enabled' /etc/nginx/nginx.conf; then
    ok "layout: sites-available/ + sites-enabled/"
  elif grep -Rqs 'conf.d' /etc/nginx/nginx.conf; then
    ok "layout: conf.d/"
  else
    warn "nginx.conf includes neither sites-enabled nor conf.d — install the config manually"
  fi
  others=$(grep -RlsE "server_name[^;]*\b${DOMAIN//./\\.}\b" /etc/nginx 2>/dev/null | grep -v 'whiteitlab.conf' | grep -v '\.bak\.' || true)
  [ -z "$others" ] && ok "no other config uses server_name ${DOMAIN}" || bad "other configs already use ${DOMAIN}: $others"
  zones=$(grep -RlsE 'zone=wl_(contact|general)' /etc/nginx 2>/dev/null | grep -v 'whiteitlab.conf' | grep -v '\.bak\.' || true)
  [ -z "$zones" ] && ok "limit_req zone names wl_* are free" || bad "limit_req zones wl_* already defined in: $zones"
  nginx -t >/dev/null 2>&1 && ok "current nginx config is valid (nginx -t)" || bad "current nginx config is ALREADY broken — fix it before adding anything"
else
  bad "nginx not found on the host"
fi

echo "== TLS / certbot"
command -v certbot >/dev/null && ok "$(certbot --version 2>&1)" || warn "certbot not installed (apt install certbot)"
[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] && ok "certificate for ${DOMAIN} exists" || warn "no certificate for ${DOMAIN} yet (normal on first deploy)"

echo "== DNS"
srv_ips=$(hostname -I 2>/dev/null)
for h in "$DOMAIN" "www.$DOMAIN"; do
  ip=$(getent ahostsv4 "$h" | awk 'NR==1 {print $1}')
  if [ -z "$ip" ]; then bad "$h does not resolve"
  elif echo " $srv_ips " | grep -q " $ip "; then ok "$h -> $ip (this server)"
  else warn "$h -> $ip, this server has: $srv_ips (OK if behind NAT/floating IP, otherwise fix DNS)"; fi
done

echo "== Project files in $ROOT"
[ -f "$ROOT/compose.yaml" ] && ok "compose.yaml" || bad "compose.yaml missing — is the code in $ROOT?"
if [ -f "$ROOT/.env" ]; then
  perm=$(stat -c %a "$ROOT/.env"); [ "$perm" = 600 ] && ok ".env (600)" || warn ".env permissions $perm — run: chmod 600 .env"
  grep -q 'smtp.example.com' "$ROOT/.env" && bad ".env still has example SMTP_HOST"
else
  bad ".env missing — cp .env.example .env"
fi
if [ -f "$ROOT/secrets/smtp_pass" ]; then
  own=$(stat -c '%u:%a' "$ROOT/secrets/smtp_pass")
  [ "$own" = "65532:400" ] && ok "secrets/smtp_pass (65532, 400)" || bad "secrets/smtp_pass is $own — run: chown 65532:65532 secrets/smtp_pass && chmod 400 secrets/smtp_pass"
else
  bad "secrets/smtp_pass missing"
fi

echo
if [ "$FAIL" -gt 0 ]; then echo "RESULT: $FAIL problem(s), $WARN warning(s) — fix ✘ first."; exit 1; fi
echo "RESULT: ready ($WARN warning(s))."

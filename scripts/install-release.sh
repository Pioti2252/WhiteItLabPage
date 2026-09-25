#!/usr/bin/env bash
# Installs a manually uploaded archive as the new release of /opt/whiteitlab.
#   1. unpacks it into /opt/whiteitlab.new (the running site is untouched),
#   2. moves .env and secrets/ over (never copied, never inside the archive),
#   3. swaps directories: current -> /opt/whiteitlab.old, new -> /opt/whiteitlab,
#   4. runs scripts/deploy.sh (build + health check + image rollback),
#   5. if the deploy fails, swaps the directories back as well.
#
#   sudo bash /opt/whiteitlab/scripts/install-release.sh /tmp/whiteitlab.tar.gz
set -euo pipefail

ARCHIVE="${1:?usage: sudo bash $0 /path/to/whiteitlab.tar.gz}"
APP=/opt/whiteitlab
NEW="$APP.new"
OLD="$APP.old"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo (needs write access to /opt)."; exit 1; }
[ -f "$ARCHIVE" ] || { echo "No archive: $ARCHIVE"; exit 1; }
[ -f "$APP/.env" ] && [ -d "$APP/secrets" ] || { echo "$APP/.env or $APP/secrets missing — is this the first install? See docs/DEPLOYMENT.md"; exit 1; }

echo "[release] unpacking $ARCHIVE -> $NEW"
rm -rf "$NEW"
mkdir -p "$NEW"
tar -xzf "$ARCHIVE" -C "$NEW"
[ -f "$NEW/compose.yaml" ] || { echo "Archive does not look like whiteitlab (no compose.yaml)"; rm -rf "$NEW"; exit 1; }

swap_back() {
  echo "[release] restoring the previous code directory"
  mv "$APP/.env" "$OLD/.env"
  mv "$APP/secrets" "$OLD/secrets"
  rm -rf "$NEW"; mv "$APP" "$NEW"; mv "$OLD" "$APP"
  echo "[release] previous release is back in $APP (failed one kept in $NEW for inspection)"
}

echo "[release] moving .env and secrets/ into the new release"
mv "$APP/.env" "$NEW/.env"
mv "$APP/secrets" "$NEW/secrets"

rm -rf "$OLD"
mv "$APP" "$OLD"
mv "$NEW" "$APP"

cd "$APP"
if bash scripts/deploy.sh; then
  echo "[release] done. Previous code kept in $OLD (delete when happy: sudo rm -rf $OLD)"
else
  swap_back
  exit 1
fi

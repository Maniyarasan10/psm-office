#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Roll the API back to the previous release.
#
#   sudo bash deploy/rollback.sh
#
# Releases are captured by deploy/update.sh into /opt/psm-office/.releases/<sha>.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/psm-office}"
SERVICE_USER="psm"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[fail] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run this script with sudo"

CURRENT_SHA="$(cat "$APP_DIR/.current-sha" 2>/dev/null || echo none)"
mapfile -t RELEASES < <(ls -1 "$APP_DIR/.releases" 2>/dev/null || true)
[ "${#RELEASES[@]}" -gt 0 ] || die "no previous release is stored in $APP_DIR/.releases"

TARGET="${RELEASES[-1]}"
if [ "$TARGET" = "$CURRENT_SHA" ]; then
    die "the newest stored release is the one that is running ($TARGET)"
fi

log "rolling back from ${CURRENT_SHA:0:8} to $TARGET"
rm -rf "$APP_DIR/backend"
cp -a "$APP_DIR/.releases/$TARGET/backend" "$APP_DIR/backend"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/backend"

log "restarting the API"
systemctl restart psm-office.service
sleep 6

if ! curl -fsS --max-time 15 http://127.0.0.1:8000/api/health; then
    die "the rolled-back release does not answer on 127.0.0.1:8000 - inspect 'journalctl -u psm-office -n 50'"
fi

echo "$TARGET" > "$APP_DIR/.current-sha"
log "rolled back to $TARGET"

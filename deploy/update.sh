#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy a new version of the API (pull, install dependencies, restart).
#
#   sudo bash deploy/update.sh
#
# The previous release is kept at /opt/psm-office/.releases/<sha> so a broken
# deploy can be rolled back with deploy/rollback.sh.
# ---------------------------------------------------------------------------
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/psm-office}"
SERVICE_USER="psm"
REPO_REF="${REPO_REF:-main}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[fail] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run this script with sudo"

log "Fetching $REPO_REF"
sudo -u "$SERVICE_USER" git -C "$APP_DIR" fetch --all --tags
sudo -u "$SERVICE_USER" git -C "$APP_DIR" checkout "$REPO_REF"
sudo -u "$SERVICE_USER" git -C "$APP_DIR" reset --hard "origin/$REPO_REF"
NEW_SHA="$(sudo -u "$SERVICE_USER" git -C "$APP_DIR" rev-parse HEAD)"
OLD_SHA="$(cat "$APP_DIR/.current-sha" 2>/dev/null || echo none)"
log "previous=$OLD_SHA new=$NEW_SHA"

log "Saving the current release for rollback"
mkdir -p "$APP_DIR/.releases"
if [ "$OLD_SHA" != "none" ]; then
    rm -rf "$APP_DIR/.releases/$OLD_SHA"
    mkdir -p "$APP_DIR/.releases/$OLD_SHA"
    cp -a "$APP_DIR/backend" "$APP_DIR/.releases/$OLD_SHA/backend"
fi

log "Installing dependencies"
sudo -u "$SERVICE_USER" "$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"

log "Validating the configuration"
sudo -u "$SERVICE_USER" "$APP_DIR/venv/bin/python" "$APP_DIR/deploy/check_config.py" \
    /etc/psm-office/psm-office.env "$APP_DIR" || die "configuration is invalid - nothing was restarted"

log "Restarting the API"
systemctl restart psm-office.service
sleep 6

if ! curl -fsS "http://127.0.0.1:8000/api/health"; then
    log "Health check failed - rolling back to $OLD_SHA"
    [ "$OLD_SHA" != "none" ] || die "no previous release to roll back to"
    rm -rf "$APP_DIR/backend"
    cp -a "$APP_DIR/.releases/$OLD_SHA/backend" "$APP_DIR/backend"
    systemctl restart psm-office.service
    die "rolled back to $OLD_SHA"
fi

echo "$NEW_SHA" > "$APP_DIR/.current-sha"
log "Deployed $NEW_SHA"

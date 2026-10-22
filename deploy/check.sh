#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Post-deployment verification.
#
#   sudo bash deploy/check.sh [domain]
#
# Runs every check the deployment needs to pass before traffic is switched over.
# Exits non-zero if any check fails.
# ---------------------------------------------------------------------------
set -uo pipefail

DOMAIN="${1:-${PSM_DOMAIN:-api.problemsolvingmind.com}}"
APP_DIR="${APP_DIR:-/opt/psm-office}"
FAILED=0

pass() { printf '\033[1;32mPASS\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mFAIL\033[0m %s\n' "$*"; FAILED=1; }
info() { printf '\n\033[1;34m--- %s ---\033[0m\n' "$*"; }

info "systemd service"
if systemctl is-active --quiet psm-office.service; then
    systemctl --no-pager --lines=5 status psm-office.service || true
    pass "psm-office.service is active"
else
    systemctl --no-pager --lines=30 status psm-office.service || true
    fail "psm-office.service is not active"
fi

info "restart policy"
RESTARTS="$(systemctl show psm-office.service -p NRestarts --value)"
echo "restarts since boot: $RESTARTS"
if [ "${RESTARTS:-0}" -gt 3 ]; then
    fail "the service keeps restarting - check 'journalctl -u psm-office -n 100'"
else
    pass "the service is not crash-looping"
fi

info "local health"
if HEALTH="$(curl -fsS --max-time 15 http://127.0.0.1:8000/api/health)"; then
    echo "$HEALTH"
    echo "$HEALTH" | grep -q '"database":true' \
        && pass "MongoDB is reachable" \
        || fail "the health endpoint does not report a healthy database"
    echo "$HEALTH" | grep -q '"backend":"cloudinary"' \
        && pass "media storage is Cloudinary" \
        || fail "media storage is not Cloudinary - uploads will fall back to local disk"
else
    fail "http://127.0.0.1:8000/api/health did not answer"
fi

info "dns"
if getent hosts "$DOMAIN" >/dev/null 2>&1; then
    getent hosts "$DOMAIN"
    pass "$DOMAIN resolves"
else
    fail "$DOMAIN does not resolve - update the DNS A record"
fi

info "public https"
if HEALTH="$(curl -fsS --max-time 20 "https://$DOMAIN/api/health")"; then
    echo "$HEALTH"
    pass "https://$DOMAIN/api/health returned 200"
else
    fail "https://$DOMAIN/api/health failed"
fi

info "tls certificate"
if command -v openssl >/dev/null 2>&1; then
    echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
        | openssl x509 -noout -subject -issuer -dates 2>/dev/null \
        && pass "certificate is valid" \
        || fail "could not read the TLS certificate"
else
    echo "openssl not installed - skipping"
fi

info "caddy"
if systemctl is-active --quiet caddy; then
    pass "caddy is active"
else
    fail "caddy is not active"
    journalctl -u caddy --no-pager --lines=20 || true
fi

info "websocket"
if python3 "$APP_DIR/deploy/ws_check.py" "https://$DOMAIN" /etc/psm-office/psm-office.env; then
    pass "the realtime websocket handshake works"
else
    fail "the realtime websocket handshake failed"
fi

info "logs"
journalctl -u psm-office.service --no-pager --lines=15 || true

echo
if [ "$FAILED" -eq 0 ]; then
    printf '\033[1;32mAll checks passed.\033[0m\n'
else
    printf '\033[1;31mSome checks failed.\033[0m\n'
fi
exit "$FAILED"

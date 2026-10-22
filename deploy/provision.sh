#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Provision the PSM Office Manager API on an Ubuntu 24.04 server.
#
#   sudo bash deploy/provision.sh
#
# Idempotent: safe to re-run. It never overwrites an existing environment
# file, and it never touches MongoDB or Cloudinary.
#
# Optional environment variables:
#   REPO_URL            git clone source (default: the GitHub repository)
#   REPO_REF            branch or tag to deploy (default: main)
#   PSM_DOMAIN          public hostname (default: api.problemsolvingmind.com)
#   APP_DIR             install prefix (default: /opt/psm-office)
#   PSM_CONFIGURE_UFW  set to 0 to leave ufw alone (default: 1)
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Maniyarasan10/psm-office.git}"
REPO_REF="${REPO_REF:-main}"
PSM_DOMAIN="${PSM_DOMAIN:-api.problemsolvingmind.com}"
APP_DIR="${APP_DIR:-/opt/psm-office}"
ENV_DIR="/etc/psm-office"
ENV_FILE="$ENV_DIR/psm-office.env"
PSM_CONFIGURE_UFW="${PSM_CONFIGURE_UFW:-1}"
SERVICE_USER="psm"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[warn] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[fail] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run this script with sudo"

# --------------------------------------------------------------- base system
log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    python3 python3-venv python3-pip python3-dev \
    git curl ca-certificates unzip rsync

if [[ "$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')" != "3.12" ]]; then
    warn "expected Python 3.12 (Ubuntu 24.04), found $(python3 -V)"
fi

# ------------------------------------------------------------------- caddy
log "Installing Caddy (reverse proxy + automatic TLS)"
if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi
caddy version

# ------------------------------------------------------------------- user
log "Creating the $SERVICE_USER system account"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# ------------------------------------------------------------------- code
log "Fetching the application code into $APP_DIR"
mkdir -p "$APP_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
    sudo -u "$SERVICE_USER" git -C "$APP_DIR" fetch --all --tags
    sudo -u "$SERVICE_USER" git -C "$APP_DIR" checkout "$REPO_REF"
    sudo -u "$SERVICE_USER" git -C "$APP_DIR" reset --hard "origin/$REPO_REF"
else
    sudo -u "$SERVICE_USER" git clone --branch "$REPO_REF" "$REPO_URL" "$APP_DIR"
fi
sudo -u "$SERVICE_USER" git -C "$APP_DIR" rev-parse --short HEAD

# --------------------------------------------------------------- python env
log "Creating the virtualenv and installing pinned dependencies"
sudo -u "$SERVICE_USER" python3 -m venv "$APP_DIR/venv"
sudo -u "$SERVICE_USER" "$APP_DIR/venv/bin/pip" install --quiet --upgrade pip wheel
sudo -u "$SERVICE_USER" "$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"
sudo -u "$SERVICE_USER" "$APP_DIR/venv/bin/pip" list --format=freeze | head -n 30

# ------------------------------------------------------------ writable dirs
log "Preparing writable directories"
mkdir -p "$APP_DIR/backend/uploads/profiles" "$APP_DIR/backend/uploads/attendance" "$APP_DIR/backend/backups"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/backend/uploads" "$APP_DIR/backend/backups"

# ------------------------------------------------------------- environment
log "Preparing $ENV_FILE"
mkdir -p "$ENV_DIR"
chmod 750 "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
    install -m 640 -o root -g "$SERVICE_USER" "$APP_DIR/deploy/psm-office.env.example" "$ENV_FILE"
    warn "$ENV_FILE was created from the template - fill in the secrets before starting"
else
    log "$ENV_FILE already exists, leaving it untouched"
fi
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

# ------------------------------------------------------------------ systemd
log "Installing the systemd unit"
install -m 644 "$APP_DIR/deploy/psm-office.service" /etc/systemd/system/psm-office.service
systemctl daemon-reload
systemctl enable psm-office.service >/dev/null

# -------------------------------------------------------------------- caddy
log "Writing the Caddy site configuration for $PSM_DOMAIN"
if [ ! -f /etc/caddy/Caddyfile ] || grep -q "api.problemsolvingmind.com" /etc/caddy/Caddyfile; then
    sed "s/api\.problemsolvingmind\.com/${PSM_DOMAIN}/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
    systemctl enable caddy >/dev/null
    systemctl reload caddy || systemctl restart caddy
else
    warn "/etc/caddy/Caddyfile exists and looks custom - not overwriting it"
fi

# ------------------------------------------------------------------ firewall
if [ "$PSM_CONFIGURE_UFW" = "1" ]; then
    log "Configuring the ufw firewall"
    ufw allow OpenSSH >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw --force enable >/dev/null
    ufw status verbose
fi

# -------------------------------------------------------------------- start
log "Validating the production configuration"
if ! sudo -u "$SERVICE_USER" "$APP_DIR/venv/bin/python" "$APP_DIR/deploy/check_config.py" "$ENV_FILE" "$APP_DIR"; then
    die "the production configuration is not valid yet - edit $ENV_FILE and re-run this script"
fi

log "Starting the API"
systemctl restart psm-office.service
sleep 6
systemctl --no-pager --lines=25 status psm-office.service || true

log "Local health check"
curl -fsS "http://127.0.0.1:8000/api/health" && echo || die "the API did not answer on 127.0.0.1:8000"

cat <<EOF

Provisioning finished.

Next:
  1. Point the DNS A record for $PSM_DOMAIN at this server's public IP.
  2. Make sure the GCP firewall allows tcp:22, tcp:80 and tcp:443.
  3. Run:  sudo bash $APP_DIR/deploy/check.sh
EOF

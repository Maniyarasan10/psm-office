# Deploying the PSM Office Manager API

Target: **Google Cloud Compute Engine `e2-micro` (Always Free)** running the Flask API behind Caddy,
with MongoDB Atlas (M0) and Cloudinary unchanged.

- API hostname: `api.problemsolvingmind.com`
- App directory on the server: `/opt/psm-office`
- Service unit: `psm-office.service` (systemd)
- Reverse proxy + TLS: Caddy
- Cost: $0/month while the free tier is not exceeded

---

## 0. Why this platform

| Requirement | How it is met |
| --- | --- |
| Never spin down | A VM stays on 24/7; no 15-minute idle sleeps, no cold starts |
| Free | `e2-micro` is a perpetual Always Free tier (1 GB RAM, 30 GB disk, 1 GB egress/month) |
| Real sockets to MongoDB Atlas | A normal Linux process can open TCP + TLS to `*.mongodb.net` |
| Background worker + threads | `threading` works; `backend/app.py` starts its auto-absent worker |
| Persistent disk for backups | The root disk is persistent; backups live in `backend/backups/` |
| HTTPS | Caddy issues and renews a Let's Encrypt certificate automatically |

Rejected alternatives: Cloudflare Workers (no raw sockets for PyMongo, ephemeral disk, no threads),
Render / Koyeb / Fly (spin down or paid), Railway ($1/month minimum), Cloud Run (scales to zero),
AWS / Azure free tiers (12 months only), PythonAnywhere (daily restart, no custom domain).

---

## 1. Before you start

You need:

- A Google Cloud account with billing enabled (a card must be on file, nothing is charged inside the free tier).
- Access to the Namecheap DNS zone for `problemsolvingmind.com`.
- Access to the MongoDB Atlas cluster (IP access list).
- The code pushed to GitHub - see the warning in section 2.

### Warning: uncommitted local changes

The local working tree of `psm-office` has **modified and untracked files** that are not in Git yet.
`deploy/provision.sh` clones the repository from GitHub, so anything not committed and pushed will
**not** be deployed. Commit and push the pending changes before provisioning:

```bash
git status
git add -A
git commit -m "..."
git push origin main
```

---

## 2. Create the GCP virtual machine

1. Open the GCP console → **Compute Engine → VM instances → CREATE INSTANCE**.
2. **Name**: `psm-office-api`.
3. **Region**: `us-central1` (any of `us-central1`, `us-east1`, `us-west1` keeps the VM inside the free tier).
4. **Machine type**: `e2-micro` (1 vCPU shared core, 1 GB memory). Series `E2`, type `e2-micro`.
   The label must read **"Free tier eligible: yes"**.
5. **Boot disk**: `Ubuntu 24.04 LTS` (x86_64), 10 GB `pd-balanced`.
6. **External IP**: `Ephemeral` is fine for a first deploy, but **assign a static address** so the
   DNS record never breaks:
   - either pick **Static** in the network dropdown when creating the VM,
   - or reserve one afterwards: **Compute Engine → Addresses → CREATE ADDRESS → Region `us-central1` → IPv4 → Reserve**, then attach it in the VM's **Network tags** row.
7. **Firewall → Network tags**: add `http-server` (allows tcp:80 and tcp:443 from 0.0.0.0/0) and
   `ssh` (allows tcp:22). Restrict `ssh` to your own IP if you prefer.
8. **Management → SSH keys**: add your public key (`ssh-keygen` output `~/.ssh/id_ed25519.pub`).
   Choose **Compute Engine default (recommended)** if you have never connected to this project before.
9. Click **CREATE**.

> The VM must be in a free-tier region and use an `e2-micro` machine type. A `e2-small`, `n1-standard-1`
> or a disk larger than 30 GB is billed.

### Budget alert (recommended)

Billing → **Budgets & alerts → Create budget**: amount `5 USD`, alert thresholds at 50 %, 90 % and 100 %.
A budget only notifies, it does not cap usage, but it is the earliest warning that the free tier is
about to be exceeded.

---

## 3. Allow the VM's IP in MongoDB Atlas

1. Atlas → **Network Access → Add IP Address** → add the VM's **static external IP**.
2. Do **not** use `0.0.0.0/0`; that would expose the cluster to the whole internet.
3. Click **Apply Changes** and wait for the change to deploy (usually under a minute).

---

## 4. Point the DNS at the VM

Namecheap → **Advanced DNS** → the `problemsolvingmind.com` zone → **Add New Record**:

| Field | Value |
| --- | --- |
| Type | `A` |
| Host | `api` |
| Value | the VM's static IPv4 address |
| TTL | `600` (Automatic is fine) |

Keep **"Proxy" OFF** (DNS-only). A proxied record breaks Caddy's HTTP-01 certificate challenge.

Existing records that stay untouched:

- `@` → GitHub Pages (185.199.108.153 …) for the main site
- `admin` → Netlify for the admin panel
- the old `api` A record → `167.71.235.35` (DigitalOcean) - **replace this one**, it is the record
  currently pointing at the old, dead server.

Verify after a few minutes:

```bash
nslookup api.problemsolvingmind.com
```

---

## 5. Provision the server

From your machine:

```bash
ssh psm-api@<VM_IP>            # user name depends on the key you registered
```

Then upload the repository (or clone it) and run the provisioner. The simplest route is to clone the
repository on the server and run the script from there:

```bash
sudo apt-get update -qq
sudo apt-get install -y git
git clone https://github.com/Maniyarasan10/psm-office.git /tmp/psm-office
cd /tmp/psm-office
sudo bash deploy/provision.sh
```

The script is idempotent and does the following:

1. installs Python 3.12, venv, git and build tooling,
2. installs Caddy from the official apt repository,
3. creates the unprivileged `psm` system user,
4. clones the repository into `/opt/psm-office` and installs the pinned dependencies into
   `/opt/psm-office/venv`,
5. creates the writable `backend/uploads` and `backend/backups` directories,
6. writes `/etc/psm-office/psm-office.env` from the template (only if it does not exist yet),
7. installs `deploy/psm-office.service` and enables it,
8. writes `/etc/caddy/Caddyfile`,
9. opens ports 22, 80 and 443 in `ufw`,
10. validates the production configuration and starts the service.

The last step fails on purpose when the environment file is not filled in yet.

### Fill in the secrets

```bash
sudo nano /etc/psm-office/psm-office.env
```

At minimum set:

| Variable | Notes |
| --- | --- |
| `MONGO_URI` | the Atlas connection string from the Atlas UI (password percent-encoded) |
| `MONGO_DB_NAME` | `psm_office_manager` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | from the Cloudinary dashboard |
| `AUTH_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` - changing it logs everyone out |
| `ADMIN_PASSWORD` | at least 12 characters, or set `ADMIN_PASSWORD_HASH` instead of a plaintext password |
| `AUTH_REQUIRED` | `1` |
| `CORS_ORIGINS` | comma-separated allowlist of the admin panel and app origins |
| `FLASK_ENV` | `production` |

Optional but recommended: `SMTP_*` (mail for new-hire credentials and password resets),
`FIREBASE_CREDENTIALS` / `FIREBASE_CREDENTIALS_JSON` (push notifications).

Validate and start:

```bash
sudo /opt/psm-office/venv/bin/python /opt/psm-office/deploy/check_config.py \
    /etc/psm-office/psm-office.env /opt/psm-office
sudo systemctl restart psm-office
```

`check_config.py` reproduces exactly the checks `backend.config.validate_config()` runs at startup
(`AUTH_SECRET`, `CORS_ORIGINS`, `AUTH_REQUIRED`, `ADMIN_PASSWORD` strength, `FLASK_DEBUG`,
the production database name and `REQUIRE_CLOUDINARY`).

---

## 6. Verify the deployment

```bash
sudo bash /opt/psm-office/deploy/check.sh
```

It checks the service state, restart count, the local health endpoint, DNS resolution, the public
HTTPS health endpoint, the TLS certificate, Caddy and the realtime WebSocket handshake
(`deploy/ws_check.py` logs in as admin and opens `/api/ws`).

Expected output:

```
--- local health ---
{"database":true,"status":"ok","storage":{"backend":"cloudinary",...}}
PASS MongoDB is reachable
PASS media storage is Cloudinary
--- public https ---
PASS https://api.problemsolvingmind.com/api/health returned 200
--- websocket ---
WebSocket https://api.problemsolvingmind.com/api/ws -> HTTP/1.1 101 Switching Protocols / {"type": "connected"}
PASS the realtime websocket handshake works
```

---

## 7. Point the clients at the new server

The admin panel (Netlify) and the mobile app already read the API URL from their environment
configuration. If the API URL changes, update it in those environments and redeploy:

- `frontend/.env` → `VITE_API_URL=https://api.problemsolvingmind.com` (the Netlify site is built
  from the `frontend-only` branch, see `frontend/netlify.toml`)
- `mobile/src/config/env.ts` → the same URL for the app builds

Nothing else changes: the route paths, the JSON shapes and the MongoDB documents are identical.

---

## 8. Day-to-day operations

```bash
# logs
sudo journalctl -u psm-office -f
sudo journalctl -u psm-office --since "1 hour ago"

# restart
sudo systemctl restart psm-office

# deploy a new version
sudo bash /opt/psm-office/deploy/update.sh

# re-run the health checks
sudo bash /opt/psm-office/deploy/check.sh
```

`update.sh` pulls `main`, installs the dependencies, validates the configuration, restarts the
service and rolls back to the previous release automatically if the health check fails.

### Backups

`backend/routes/backup_routes.py` writes ZIP archives into `backend/backups/` on the server's
persistent disk. Copy them off the machine periodically:

```bash
scp psm-api@<VM_IP>:/opt/psm-office/backend/backups/*.zip ./backups/
```

---

## 9. Rollback

If a release misbehaves:

```bash
sudo bash /opt/psm-office/deploy/rollback.sh
```

The previous release is stored in `/opt/psm-office/.releases/<sha>/` by `update.sh`.

---

## 10. Cost control

| Item | Free tier | What happens if exceeded |
| --- | --- | --- |
| `e2-micro` VM | 1 instance, always free | a second instance is billed |
| Boot disk | 30 GB `pd-standard`/`pd-balanced` | extra GB is billed |
| Egress | 1 GB/month | extra traffic is billed |
| Static IP | 1 per region, free while attached to a VM | a reserved-but-unused IP is billed |
| MongoDB Atlas M0 | shared cluster, 5 GB | upgrade required |
| Cloudinary | free tier | upgrade required |

Keep an eye on the egress figure: the API serves small JSON responses, so 30 users are far below
1 GB/month. A large file download through the API is the only realistic way to exceed it.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `curl https://api.problemsolvingmind.com/api/health` times out | DNS not updated yet, or the GCP firewall does not allow tcp:443 |
| `Caddy` cannot obtain a certificate | the DNS record is proxied, or port 80 is closed. Use a DNS-only record and open tcp:80 |
| `no healthy upstream` in the Caddy log | the API is not running: `systemctl status psm-office`, `journalctl -u psm-office -n 50` |
| The service restarts in a loop | usually the configuration: run `check_config.py`, the message names the failing variable |
| `AUTH_SECRET must be set...` | the env file is missing or unreadable by the `psm` user: `ls -l /etc/psm-office/psm-office.env` |
| MongoDB times out | the VM's IP is missing from the Atlas IP access list |
| WebSocket connects but no push events arrive | more than one gunicorn worker is running; `backend/realtime.py` keeps its registry in memory, so the unit must stay at `--workers 1` |
| Uploads stay local instead of going to Cloudinary | `REQUIRE_CLOUDINARY=1` with missing Cloudinary credentials; the health endpoint reports the active storage backend |

---

## 12. Notes on the service definition

`deploy/psm-office.service` runs:

```
gunicorn --bind 127.0.0.1:8000 --workers 1 --threads 8 --worker-class gthread wsgi:app
```

- **One worker on purpose.** `backend/realtime.py` keeps the WebSocket registry in memory, so a
  second worker process would hold a different set of connections and push events would reach only
  part of the audience. `backend/Procfile` still says `--workers 2` for other hosts - change it there
  too if you deploy anywhere else.
- **Eight threads** absorb the concurrent dashboard requests of ~30 users without extra processes.
- **The port is bound to localhost**; only Caddy can reach it.
- **`MemoryMax=700M`** keeps a runaway report from taking the 1 GB box down with it.
- Caddy terminates TLS and forwards `X-Forwarded-For`, which is why `TRUST_PROXY=1` is set.

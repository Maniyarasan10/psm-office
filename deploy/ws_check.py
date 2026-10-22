"""Verify the realtime WebSocket endpoint of a running deployment.

    python deploy/ws_check.py [base_url] [env_file]

Logs in with the admin credentials from the environment file, opens
/api/ws?token=... and asserts that the server completes the WebSocket
handshake and sends the "connected" event.

Exit codes: 0 = ok, 1 = failed, 2 = could not run (missing config).
"""
import base64
import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = (sys.argv[1] if len(sys.argv) > 1 else "https://api.problemsolvingmind.com").rstrip("/")
ENV_FILE = sys.argv[2] if len(sys.argv) > 2 else "/etc/psm-office/psm-office.env"


def read_env(path):
    values = {}
    if not os.path.exists(path):
        return values
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key.strip()] = value
    return values


def get_token(env):
    username = env.get("ADMIN_USERNAME", "admin")
    password = env.get("ADMIN_PASSWORD", "")
    if not password:
        return None, "ADMIN_PASSWORD is not set in the environment file"

    request = urllib.request.Request(
        f"{BASE_URL}/api/auth/admin-login",
        data=json.dumps({"username": username, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        return None, f"admin login failed: HTTP {exc.code} {exc.read().decode(errors='replace')[:200]}"
    except Exception as exc:  # noqa: BLE001
        return None, f"admin login failed: {exc}"

    token = body.get("token")
    if not token:
        return None, f"admin login returned no token: {body}"
    return token, None


def websocket_check(token):
    scheme, _, rest = BASE_URL.partition("://")
    host = rest.split("/", 1)[0]
    path = "/" + rest.split("/", 1)[1] if "/" in rest else "/"
    hostname, _, port_text = host.partition(":")
    default_port = 443 if scheme == "https" else 80
    port = int(port_text or default_port)

    key = base64.b64encode(os.urandom(16)).decode()
    request = (
        f"GET {path}api/ws?token={token} HTTP/1.1\r\n"
        f"Host: {host}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    )

    context = ssl.create_default_context() if scheme == "https" else None
    raw = socket.create_connection((hostname, port), timeout=20)
    sock = context.wrap_socket(raw, server_hostname=hostname) if context else raw
    sock.settimeout(20)
    sock.sendall(request.encode())

    buffer = b""
    while b"\r\n\r\n" not in buffer:
        chunk = sock.recv(4096)
        if not chunk:
            break
        buffer += chunk

    head, _, rest = buffer.partition(b"\r\n\r\n")
    status = head.split(b"\r\n")[0].decode(errors="replace") if head else "(no response)"
    if "101" not in status:
        sock.close()
        return False, f"expected HTTP 101, got: {status}"

    frame = rest
    while len(frame) < 2:
        chunk = sock.recv(4096)
        if not chunk:
            break
        frame += chunk

    opcode = frame[0] & 0x0F if frame else None
    length = frame[1] & 0x7F if len(frame) > 1 else 0
    payload = frame[2:2 + length] if length < 126 else b""
    sock.close()

    if opcode != 0x1:
        return False, f"handshake ok but no text frame (opcode {opcode}, payload {payload!r})"
    if b"connected" not in payload:
        return False, f"unexpected first frame: {payload!r}"
    return True, f"{status} / {payload.decode(errors='replace')}"


def main():
    env = read_env(ENV_FILE)
    token, error = get_token(env)
    if error:
        print(f"FAIL: {error}")
        return 2

    ok, detail = websocket_check(token)
    print(f"WebSocket {BASE_URL}/api/ws -> {detail}")
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

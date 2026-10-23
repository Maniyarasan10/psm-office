"""Stateless HMAC-signed authentication tokens.

Tokens are compact URLsafe-base64 ``payload.signature`` strings (no external
dependency). They carry a subject, a role ("admin" or "user"), an expiry and
optional person metadata. Verification is constant-time and expiry-aware.

Enforcement is flag-gated by ``AUTH_REQUIRED`` (see backend.config). When the
flag is off, the decorators are no-ops for backward compatibility, but a valid
token is still parsed and exposed via ``current_auth()``.
"""
import base64
import hashlib
import hmac
import json
import time
from functools import wraps

from flask import g, jsonify, request

from backend import config
from backend.utils import token_versions


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _sign(body: str) -> str:
    digest = hmac.new(
        config.auth_secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256
    ).digest()
    return _b64e(digest)


def issue_token(subject, role, person_type=None, display_name=None, ttl=None, extra=None):
    now = int(time.time())
    payload = {
        "sub": str(subject),
        "role": role,
        "iat": now,
        "exp": now + (config.token_ttl() if ttl is None else int(ttl)),
        "token_type": "access",
        # Global + per-person revocation counters (see token_versions.py).
        "ver": token_versions.get_version(None),
    }
    if role != "admin":
        payload["pv"] = token_versions.get_version(subject)
    if person_type:
        payload["person_type"] = person_type
    if display_name:
        payload["name"] = display_name
    if extra:
        payload.update(extra)
    body = _b64e(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def verify_token(token, expected_type=None):
    """Verify a signed token and return its payload, or ``None``.

    ``expected_type`` restricts the accepted ``token_type`` (e.g. ``"access"``).
    Data endpoints must only ever accept access tokens; refresh tokens are valid
    exclusively at the refresh endpoint.
    """
    if not token or "." not in token:
        return None
    body, signature = token.split(".", 1)
    if not hmac.compare_digest(_sign(body), signature):
        return None
    try:
        payload = json.loads(_b64d(body).decode("utf-8"))
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    try:
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
    except (TypeError, ValueError):
        return None
    if expected_type is not None and payload.get("token_type") != expected_type:
        return None
    # Revoked tokens are rejected even when their signature and expiry are
    # still valid.
    try:
        if int(payload.get("ver", 0)) != token_versions.get_version(None):
            return None
        if payload.get("role") != "admin":
            if int(payload.get("pv", 0)) != token_versions.get_version(payload.get("sub")):
                return None
    except (TypeError, ValueError):
        return None
    return payload


def _bearer_token():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    # Web admin panel: the token is kept in an HttpOnly cookie so scripts
    # (including a successful XSS payload) cannot read or exfiltrate it.
    cookie_name = config.auth_cookie_name()
    if cookie_name:
        cookie_token = request.cookies.get(cookie_name)
        if cookie_token:
            return cookie_token.strip()
    return None


def current_auth():
    """Return the verified *access* token payload for this request, or None.

    Refresh tokens are deliberately rejected here so they can never be replayed
    against data endpoints; they are only accepted by the refresh endpoint,
    which calls :func:`verify_token` directly with ``expected_type="refresh"``.
    """
    if getattr(g, "_auth_resolved", False):
        return getattr(g, "auth", None)
    token = _bearer_token()
    g.auth = verify_token(token, expected_type="access") if token else None
    g._auth_resolved = True
    return g.auth


def _reject(message, status):
    return jsonify({"error": message}), status


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if config.auth_required():
            auth = current_auth()
            if not auth:
                return _reject("Authentication required", 401)
            if auth.get("role") != "admin":
                return _reject("Administrator privileges required", 403)
        return fn(*args, **kwargs)

    return wrapper


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if config.auth_required() and not current_auth():
            return _reject("Authentication required", 401)
        return fn(*args, **kwargs)

    return wrapper


def can_send_announcement(auth):
    """True when the resolved token belongs to an admin or an allocated sender."""
    if not auth:
        return False
    if auth.get("role") == "admin":
        return True
    person_id = auth.get("sub")
    if not person_id:
        return False
    from backend.models.settings_model import get_announcement_senders

    senders = get_announcement_senders()
    return any(
        isinstance(sender, dict) and str(sender.get("person_id")) == str(person_id)
        for sender in senders
    )


def announcement_sender_required(fn):
    """Allow admins and admin-allocated people to publish announcements."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = current_auth()
        if not auth:
            return _reject("Authentication required", 401)
        if not can_send_announcement(auth):
            return _reject("You are not allowed to send announcements", 403)
        return fn(*args, **kwargs)

    return wrapper

"""Short-lived signatures for media URLs.

Photos and uploaded files are private. Rather than teaching every client to
send an Authorization header on image requests, the API rewrites stored paths
into signed URLs (``?exp=...&sig=...``). The signature proves the URL was
issued by this server and the expiry keeps a leaked URL from working forever.
"""
import hashlib
import hmac
import os
import time

from backend import config

_DEFAULT_TTL_SECONDS = 24 * 60 * 60


def _ttl_seconds(ttl=None):
    if ttl is not None:
        return max(1, int(ttl))
    try:
        return max(1, int(os.getenv("MEDIA_URL_TTL_SECONDS", _DEFAULT_TTL_SECONDS)))
    except (TypeError, ValueError):
        return _DEFAULT_TTL_SECONDS


def _signature(path, expires):
    message = f"{path}\n{expires}".encode("utf-8")
    secret = config.auth_secret().encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def sign_path(path, ttl=None):
    """Return ``path`` with a fresh ``exp``/``sig`` query pair appended."""
    if not path or not isinstance(path, str):
        return path
    if not (path.startswith("/uploads/") or path.startswith("/api/photo/")):
        return path
    # Strip any previous signature: URLs returned to clients can be echoed back
    # (for example when editing a profile), and we never want to persist or
    # re-use the old expiry.
    base = path.split("?", 1)[0]
    expires = int(time.time()) + _ttl_seconds(ttl)
    return f"{base}?exp={expires}&sig={_signature(base, expires)}"


def verify_path(path, expires, signature):
    """True when ``signature`` is valid for ``path`` and has not expired."""
    if not path or not expires or not signature:
        return False
    try:
        expires_int = int(expires)
    except (TypeError, ValueError):
        return False
    if expires_int < int(time.time()):
        return False
    expected = _signature(path, expires_int)
    return hmac.compare_digest(expected, str(signature))


def verify_request(path, args):
    """Validate the signature on the current request for ``path``."""
    return verify_path(path, args.get("exp"), args.get("sig"))

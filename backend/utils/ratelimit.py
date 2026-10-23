"""Small, dependency-free in-process rate limiter.

Used to slow down credential stuffing on the authentication endpoints. It is a
fixed-window counter keyed by ``(scope, client_ip)``.

Caveats (documented, not hidden): this lives in process memory, so with more
than one worker the effective limit is per worker, and it is reset on restart.
It is a defence-in-depth layer on top of strong credentials and token auth, not
a substitute for an edge rate limiter/CDN/WAF in front of the app.
"""
import os
import threading
import time
from functools import wraps

from flask import jsonify, request


class _RateLimiter:
    def __init__(self):
        self._lock = threading.Lock()
        self._hits = {}  # (scope, key) -> (window_start, count, window_seconds)
        self._last_prune = time.time()

    def _client_key(self):
        # ProxyFix (enabled by TRUST_PROXY) already resolves the trusted hop
        # into request.remote_addr. Parsing X-Forwarded-For here as well would
        # let a client spoof the first entry and bypass the limiter.
        return request.remote_addr or "unknown"

    def _prune(self, now):
        # Amortized cleanup of expired windows to bound memory.
        if now - self._last_prune < 60:
            return
        self._last_prune = now
        expired = [
            key for key, (start, _count, window) in self._hits.items()
            if now - start >= window
        ]
        for key in expired:
            self._hits.pop(key, None)

    def check(self, scope, limit, window):
        """Return (allowed, retry_after_seconds)."""
        now = time.time()
        key = (scope, self._client_key())
        with self._lock:
            self._prune(now)
            start, count, prev_window = self._hits.get(key, (now, 0, window))
            if now - start >= prev_window:
                start, count = now, 0
            count += 1
            self._hits[key] = (start, count, window)
            if count > limit:
                retry_after = max(1, int(window - (now - start)))
                return False, retry_after
        return True, 0


_limiter = _RateLimiter()


def rate_limit(limit, window, scope=None):
    """Decorator: allow ``limit`` requests per ``window`` seconds per client IP."""

    def decorator(fn):
        bucket = scope or fn.__name__

        @wraps(fn)
        def wrapper(*args, **kwargs):
            allowed, retry_after = _limiter.check(bucket, limit, window)
            if not allowed:
                response = jsonify(
                    {"error": "Too many requests. Please try again later."}
                )
                response.status_code = 429
                response.headers["Retry-After"] = str(retry_after)
                return response
            return fn(*args, **kwargs)

        return wrapper

    return decorator

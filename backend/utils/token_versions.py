"""Persistent token-version counters used to revoke signed tokens.

Tokens are stateless HMAC values, so the only way to invalidate one before its
``exp`` is to embed a version and compare it with a server-side counter.

Two counters are supported:

* the global version (admin tokens and "log everyone out"), and
* a per-person version (password changes/resets invalidate that person's
  sessions without affecting everybody else).

Counters live in the ``auth_token_versions`` collection, which also survives
restarts and is therefore safe on a dyno that is restarted or rescheduled.
"""
import threading
import time

from pymongo import ReturnDocument

from backend.db import get_db

_CACHE_TTL_SECONDS = 5
_cache = {}
_lock = threading.Lock()


def _cache_key(subject):
    return "global" if subject in (None, "", "admin") else str(subject)


def _read_version(key):
    try:
        db = get_db()
        if db is None:
            return 0
        doc = db.auth_token_versions.find_one({"_id": key})
        return int((doc or {}).get("version", 0))
    except Exception:
        return 0


def get_version(subject=None):
    """Return the current counter, cached briefly to avoid a DB hit per call."""
    key = _cache_key(subject)
    now = time.time()
    with _lock:
        cached = _cache.get(key)
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

    version = _read_version(key)
    with _lock:
        _cache[key] = (now, version)
    return version


def bump_version(subject=None):
    """Atomically increment a counter and return its new value."""
    key = _cache_key(subject)
    try:
        db = get_db()
        if db is None:
            return 0
        doc = db.auth_token_versions.find_one_and_update(
            {"_id": key},
            {"$inc": {"version": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        version = int((doc or {}).get("version", 1))
    except Exception:
        return 0

    with _lock:
        _cache[key] = (time.time(), version)
    return version


def invalidate_person(subject):
    return bump_version(subject)


def revoke_everyone():
    return bump_version(None)

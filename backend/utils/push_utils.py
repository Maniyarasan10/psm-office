"""Expo push notification sender with delivery verification.

Only attempts delivery when ENABLE_PUSH=1. Never raises: push delivery is
best-effort and must not break API responses.

Unlike a fire-and-forget POST, the Expo response is parsed and correlated back
to each recipient by index, so invalid device tokens are pruned from the
database (see ``invalid_tokens_removed``). A push is only counted as "sent"
when Expo acknowledges the individual message.
"""
import json
import os
import urllib.request

from bson import ObjectId
from backend.db import get_db

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Must match CHANNEL_ID in mobile/src/services/notificationService.ts so pushes
# land on the app-created Android channel (and its color/importance settings).
CHANNEL_ID = "psm-office-channel"

# Expo error codes that mean "stop trying this token".
INVALID_TOKEN_CODES = {"DeviceNotRegistered", "DeviceTokenInvalid", "BadRequestError"}

# Error codes that may be transient (rate limiting, server errors).
RETRYABLE_CODES = {"MessageRateExceeded", "InternalServerError", "UnknownError"}


def _prune_tokens(tokens):
    """Remove dead device tokens from employee/intern records."""
    if not tokens:
        return
    try:
        db = get_db()
        for collection in (db.employees, db.interns):
            collection.update_many(
                {"push_token": {"$in": tokens}},
                {"$unset": {"push_token": ""}},
            )
    except Exception as exc:
        print(f"Push token prune skipped: {exc}")


def send_push(tokens, title, body, data=None, sound="default"):
    """Send a push to ``tokens`` and return a delivery summary dict.

    Returns {"sent": n, "failed": n, "retryable": n, "invalid_removed": n}
    when the request reached Expo; otherwise {"sent": 0, "failed": 0, "error": ...}.
    """
    if os.getenv("ENABLE_PUSH", "0") != "1":
        return {"sent": 0, "failed": 0, "retryable": 0, "invalid_removed": 0, "disabled": True}
    recipients = [t for t in tokens if isinstance(t, str) and t]
    if not recipients:
        return {"sent": 0, "failed": 0, "retryable": 0, "invalid_removed": 0}
    messages = []
    for token in recipients:
        message = {
            "to": token,
            "body": body,
            "sound": sound,
            "priority": "high",
            "channelId": CHANNEL_ID,
            "data": data or {},
        }
        # An empty title is omitted instead of sent as "": the OS then shows
        # the body once, rather than a blank heading above the same text.
        if title:
            message["title"] = title
        messages.append(message)
    try:
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(messages).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read()
    except Exception as exc:
        print(f"Push notification skipped: {exc}")
        return {"sent": 0, "failed": 0, "retryable": 0, "invalid_removed": 0, "error": str(exc)}

    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except ValueError:
        payload = {}
    results = payload.get("data") or []

    sent = 0
    failed = 0
    retryable = 0
    invalid = []
    # Expo returns one entry per message in the same order they were sent.
    for index, entry in enumerate(results):
        if index >= len(recipients):
            break
        if not isinstance(entry, dict):
            failed += 1
            continue
        if entry.get("status") == "ok":
            sent += 1
            continue
        failed += 1
        details = entry.get("details") or {}
        code = (details.get("error") or "").strip()
        if code in INVALID_TOKEN_CODES:
            invalid.append(recipients[index])
        elif code in RETRYABLE_CODES:
            retryable += 1

    if invalid:
        _prune_tokens(invalid)

    return {
        "sent": sent,
        "failed": failed,
        "retryable": retryable,
        "invalid_removed": len(invalid),
    }


def person_push_token(person_id, person_type):
    db = get_db()
    if db is None:
        return None
    collection = db.interns if person_type == "intern" else db.employees
    try:
        oid = ObjectId(person_id)
    except Exception:
        # An invalid id must never fall through to matching an arbitrary person.
        return None
    doc = collection.find_one({"_id": oid})
    return doc.get("push_token") if doc else None
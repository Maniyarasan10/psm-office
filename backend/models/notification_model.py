"""Per-person notification inbox.

Noteworthy events (leave decisions, task assignments, support replies,
announcements) are recorded here so the mobile app's Notifications screen has a
persistent, server-backed history that survives a missed push. Recording is
best-effort: callers may pass a ``dedupe_key`` so the same event is never
stored twice.
"""
from datetime import datetime
from bson import ObjectId
from backend.db import get_db, serialize_doc

MAX_NOTIFICATIONS = 200


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _normalize_type(person_type):
    ptype = (person_type or "employee").strip().lower()
    return ptype if ptype in ("employee", "intern") else "employee"


def _build_doc(person_type, person_id, title, body, route, category, ref_id, dedupe_key, now):
    return {
        "person_type": _normalize_type(person_type),
        "person_id": str(person_id),
        "title": (title or "").strip() or "Notification",
        "body": (body or "").strip(),
        "route": route or None,
        "category": category or None,
        "ref_id": str(ref_id) if ref_id else None,
        "dedupe_key": dedupe_key or None,
        "read": False,
        "created_at": now,
    }


def add_notification(person_type, person_id, title, body="", route=None,
                     category=None, ref_id=None, dedupe_key=None):
    """Store one notification for a person. Returns the serialized doc or None."""
    db = get_db()
    if db is None or not person_id:
        return None
    if dedupe_key:
        existing = db.notifications.find_one({"dedupe_key": dedupe_key})
        if existing:
            return serialize_doc(existing)
    doc = _build_doc(person_type, person_id, title, body, route, category,
                     ref_id, dedupe_key, datetime.utcnow())
    result = db.notifications.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


def add_bulk_notifications(recipients, title, body="", route=None, category=None):
    """Store one notification per ``(person_type, person_id)`` recipient.

    Duplicate recipients are collapsed. Returns the number inserted.
    """
    db = get_db()
    if db is None:
        return 0
    now = datetime.utcnow()
    docs = []
    seen = set()
    for person_type, person_id in recipients or []:
        if not person_id:
            continue
        ptype = _normalize_type(person_type)
        key = f"{ptype}:{person_id}"
        if key in seen:
            continue
        seen.add(key)
        docs.append(_build_doc(ptype, person_id, title, body, route, category, None, None, now))
    if not docs:
        return 0
    db.notifications.insert_many(docs)
    return len(docs)


def list_notifications(person_type, person_id, limit=MAX_NOTIFICATIONS):
    db = get_db()
    if db is None or not person_id:
        return []
    query = {"person_type": _normalize_type(person_type), "person_id": str(person_id)}
    docs = list(
        db.notifications.find(query).sort("created_at", -1).limit(int(limit))
    )
    return [serialize_doc(d) for d in docs]


def unread_count(person_type, person_id):
    db = get_db()
    if db is None or not person_id:
        return 0
    query = {
        "person_type": _normalize_type(person_type),
        "person_id": str(person_id),
        "read": False,
    }
    return db.notifications.count_documents(query)


def mark_read(notification_id, person_type, person_id):
    """Mark a single notification read, scoped to its owner. Returns bool."""
    db = get_db()
    if db is None or not person_id:
        return False
    query = {"_id": _to_oid(notification_id)}
    query["person_type"] = _normalize_type(person_type)
    query["person_id"] = str(person_id)
    result = db.notifications.update_one(query, {"$set": {"read": True}})
    return result.matched_count > 0


def mark_all_read(person_type, person_id):
    db = get_db()
    if db is None or not person_id:
        return 0
    result = db.notifications.update_many(
        {
            "person_type": _normalize_type(person_type),
            "person_id": str(person_id),
            "read": False,
        },
        {"$set": {"read": True}},
    )
    return result.modified_count


def delete_notification(notification_id, person_type, person_id):
    """Delete a single notification, scoped to its owner. Returns bool."""
    db = get_db()
    if db is None or not person_id:
        return False
    query = {"_id": _to_oid(notification_id)}
    query["person_type"] = _normalize_type(person_type)
    query["person_id"] = str(person_id)
    result = db.notifications.delete_one(query)
    return result.deleted_count > 0

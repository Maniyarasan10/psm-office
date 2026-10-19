"""Company announcements.

Each announcement is stored as its own document so the mobile app can show a
history. (Historically a single ``notes`` document was overwritten on every
publish, so only the latest announcement survived.)
"""
from datetime import datetime
from backend.db import get_db, serialize_doc

MAX_ANNOUNCEMENTS = 100


def add_announcement(content, author_id=None, author_type=None, author_name=None):
    """Store one announcement. Returns the serialized doc or None."""
    db = get_db()
    if db is None:
        return None
    doc = {
        "content": (content or "").strip(),
        "author_id": str(author_id) if author_id else None,
        "author_type": author_type or None,
        "author_name": (author_name or "").strip() or None,
        "created_at": datetime.utcnow(),
    }
    result = db.announcements.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


def list_announcements(limit=MAX_ANNOUNCEMENTS):
    """Newest-first announcements for the mobile app."""
    db = get_db()
    if db is None:
        return []
    docs = list(db.announcements.find({}).sort("created_at", -1).limit(int(limit)))
    return [serialize_doc(d) for d in docs]

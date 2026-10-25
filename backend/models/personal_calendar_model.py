"""Personal calendar items.

Each signed-in person can keep their own dated notes and reminders on the
calendar. Items are scoped to the person who created them so nobody else can
read, edit or delete them.
"""
from datetime import datetime
from bson import ObjectId
from backend.db import get_db, serialize_doc

MAX_PERSONAL_ITEMS = 500


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _collection():
    db = get_db()
    return db.personal_calendar


def add_personal_item(person_id, person_type, title, notes, date):
    """Store one personal calendar item. Returns the serialized doc or None."""
    db = get_db()
    if db is None or not person_id:
        return None
    doc = {
        "person_id": str(person_id),
        "person_type": (person_type or "employee").strip().lower() or "employee",
        "title": (title or "").strip() or "Note",
        "notes": (notes or "").strip(),
        "date": (date or "").strip(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = _collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


def list_personal_items(person_id, person_type):
    """All personal items for one person, newest first."""
    db = get_db()
    if db is None or not person_id:
        return []
    docs = list(
        _collection()
        .find(
            {
                "person_id": str(person_id),
                "person_type": (person_type or "employee").strip().lower() or "employee",
            }
        )
        .sort("date", 1)
        .limit(MAX_PERSONAL_ITEMS)
    )
    return [serialize_doc(d) for d in docs]


def update_personal_item(item_id, person_id, person_type, title, notes, date):
    """Replace one owned personal item. Returns True when updated."""
    db = get_db()
    if db is None or not person_id or not item_id:
        return False
    oid = _to_oid(item_id)
    if oid is None:
        return False
    result = _collection().update_one(
        {
            "_id": oid,
            "person_id": str(person_id),
            "person_type": (person_type or "employee").strip().lower() or "employee",
        },
        {
            "$set": {
                "title": (title or "").strip() or "Note",
                "notes": (notes or "").strip(),
                "date": (date or "").strip(),
                "updated_at": datetime.utcnow(),
            }
        },
    )
    return result.matched_count > 0


def delete_personal_item(item_id, person_id, person_type):
    """Delete one owned personal item. Returns True when removed."""
    db = get_db()
    if db is None or not person_id or not item_id:
        return False
    oid = _to_oid(item_id)
    if oid is None:
        return False
    result = _collection().delete_one(
        {
            "_id": oid,
            "person_id": str(person_id),
            "person_type": (person_type or "employee").strip().lower() or "employee",
        }
    )
    return result.deleted_count > 0

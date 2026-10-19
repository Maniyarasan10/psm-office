from datetime import datetime
from backend.db import get_db, serialize_doc


def get_note():
    db = get_db()
    doc = db.notes.find_one(sort=[("created_at", -1)])
    return serialize_doc(doc) if doc else {"content": "", "_id": None}


def save_note(content):
    db = get_db()
    existing = db.notes.find_one(sort=[("created_at", -1)])
    if existing:
        db.notes.update_one(
            {"_id": existing["_id"]},
            {"$set": {"content": content, "created_at": datetime.utcnow()}}
        )
    else:
        db.notes.insert_one({
            "content": content,
            "created_at": datetime.utcnow(),
        })

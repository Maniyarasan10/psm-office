from datetime import datetime
from backend.db import get_db


def log_activity(action, details=""):
    db = get_db()
    db.activity_log.insert_one({
        "action": action,
        "details": details,
        "timestamp": datetime.utcnow(),
    })


def recent_activity(limit=8):
    db = get_db()
    docs = list(db.activity_log.find().sort("timestamp", -1).limit(limit))
    return docs

from backend.db import get_db


def get_settings():
    db = get_db()
    docs = list(db.settings.find())
    settings = {}
    for doc in docs:
        settings[doc["key"]] = doc["value"]
    return settings


def update_settings(data):
    db = get_db()
    for key, value in data.items():
        db.settings.update_one(
            {"key": key},
            {"$set": {"key": key, "value": value}},
            upsert=True,
        )


def get_announcement_senders():
    """People (employees/interns) the admin has allowed to post announcements."""
    db = get_db()
    doc = db.settings.find_one({"key": "announcement_senders"})
    value = doc.get("value") if doc else None
    return value if isinstance(value, list) else []


def set_announcement_senders(senders):
    db = get_db()
    db.settings.update_one(
        {"key": "announcement_senders"},
        {"$set": {"key": "announcement_senders", "value": senders}},
        upsert=True,
    )

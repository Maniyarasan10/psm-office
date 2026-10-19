import base64
from datetime import datetime
from uuid import uuid4
from bson import ObjectId
from pymongo import ReturnDocument
from backend.db import get_db

# Ticket lifecycle. Employee-controlled actions are guarded separately in the
# routes (cancel / reopen / confirm-resolution); this map governs the status
# transitions a support operator may perform through the support panel.
SUPPORT_TRANSITIONS = {
    "open": {"in_progress", "rejected"},
    "in_progress": {"waiting", "resolved", "rejected"},
    "waiting": {"in_progress", "resolved", "rejected"},
    "resolved": {"closed"},
    "rejected": set(),
    "closed": set(),
}

EMPLOYEE_CANCEL_FROM = {"open", "in_progress", "waiting"}
EMPLOYEE_REOPEN_FROM = {"resolved", "rejected", "closed"}

STATUS_ORDER = [
    "open", "in_progress", "waiting", "resolved", "rejected", "cancelled", "closed",
]


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def next_ticket_number():
    db = get_db()
    year = datetime.utcnow().year
    counter = db.counters.find_one_and_update(
        {"_id": f"support_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"SR-{year}-{counter['seq']:04d}"


def create_ticket(data):
    db = get_db()
    now = datetime.utcnow()
    data["ticket_number"] = next_ticket_number()
    data["status"] = "open"
    data["activity"] = [{
        "action": "created",
        "author_type": "employee",
        "author": data.get("person_label") or data.get("person_id"),
        "details": f"Ticket created in {data.get('category', 'General')}",
        "timestamp": now,
    }]
    data["comments"] = []
    data["created_at"] = now
    data["updated_at"] = now
    result = db.support_tickets.insert_one(data)
    data["_id"] = result.inserted_id
    return data


def find_ticket(ticket_id):
    db = get_db()
    doc = db.support_tickets.find_one({"_id": _to_oid(ticket_id)})
    return doc


def list_tickets(query=None, limit=100, skip=0):
    db = get_db()
    docs = list(
        db.support_tickets.find(query or {})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    return docs


def count_tickets(query=None):
    db = get_db()
    return db.support_tickets.count_documents(query or {})


def add_comment(ticket_id, comment):
    db = get_db()
    db.support_tickets.update_one(
        {"_id": _to_oid(ticket_id)},
        {"$push": {"comments": comment}, "$set": {"updated_at": datetime.utcnow()}},
    )
    return get_serialized_ticket(ticket_id)


def append_activity(ticket_id, entry):
    db = get_db()
    db.support_tickets.update_one(
        {"_id": _to_oid(ticket_id)},
        {"$push": {"activity": entry}, "$set": {"updated_at": datetime.utcnow()}},
    )


def set_status(ticket_id, status, activity_entry=None):
    db = get_db()
    update = {"$set": {"status": status, "updated_at": datetime.utcnow()}}
    if activity_entry:
        update["$push"] = {"activity": activity_entry}
    db.support_tickets.update_one({"_id": _to_oid(ticket_id)}, update)
    return get_serialized_ticket(ticket_id)


def set_priority(ticket_id, priority, activity_entry=None):
    db = get_db()
    update = {"$set": {"priority": priority, "updated_at": datetime.utcnow()}}
    if activity_entry:
        update["$push"] = {"activity": activity_entry}
    db.support_tickets.update_one({"_id": _to_oid(ticket_id)}, update)
    return get_serialized_ticket(ticket_id)


def build_attachment(file_storage):
    raw = file_storage.read()
    if not raw:
        return None
    filename = file_storage.filename or "attachment"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "attachment_id": uuid4().hex,
        "file_name": filename,
        "file_type": ext,
        "mime": file_storage.mimetype or "application/octet-stream",
        "file_size": len(raw),
        "file_data_base64": base64.b64encode(raw).decode("ascii"),
    }


def find_ticket_by_attachment(attachment_id):
    db = get_db()
    doc = db.support_tickets.find_one({"attachments.attachment_id": attachment_id})
    if doc:
        return doc, "attachments"
    doc = db.support_tickets.find_one({"comments.attachments.attachment_id": attachment_id})
    if doc:
        return doc, "comments"
    return None, None


def get_serialized_ticket(ticket_id):
    from backend.db import serialize_doc

    doc = find_ticket(ticket_id)
    return serialize_doc(doc) if doc else None
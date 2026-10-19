"""Leave requests: submission, listing and admin approval workflow.

A leave request is stored in the ``leave_requests`` collection as a pending
record when a person applies. An administrator can approve or reject it. When a
request is approved, the attendance records for every day in the range are
created/updated with the ``Leave`` status so reports stay accurate.
"""
from datetime import datetime, date as date_type
from bson import ObjectId
from backend.db import get_db, serialize_doc

LEAVE_TYPES = ("Casual", "Sick", "Emergency", "Annual")
STATUSES = ("pending", "approved", "rejected")


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _parse_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date_type):
        return value
    return date_type.fromisoformat(str(value))


def _person_snapshot(person_type, person_id):
    """Return (name, id_label) for a person, or ("", "") when not found."""
    db = get_db()
    if db is None:
        return "", ""
    collection = db.employees if str(person_type).lower() == "employee" else db.interns
    doc = collection.find_one({"_id": _to_oid(person_id)})
    if not doc:
        return "", ""
    label = doc.get("employee_id") or doc.get("intern_id") or ""
    return doc.get("name", ""), label


def create_leave_request(person_type, person_id, leave_type, start_date, end_date, reason=""):
    """Create a pending leave request. Returns ``(doc, error)``."""
    db = get_db()
    if db is None:
        return None, "Database unavailable"

    person_type = (person_type or "employee").strip().lower()
    if person_type not in ("employee", "intern"):
        return None, "Invalid person type"
    if not person_id:
        return None, "person_id is required"
    if not leave_type or not str(leave_type).strip():
        return None, "Leave type is required"

    try:
        start = _parse_date(start_date)
        end = _parse_date(end_date)
    except (ValueError, TypeError):
        return None, "Invalid date format (expected YYYY-MM-DD)"
    if end < start:
        return None, "End date cannot be before the start date"

    name, id_label = _person_snapshot(person_type, person_id)
    now = datetime.utcnow()
    doc = {
        "person_type": person_type,
        "person_id": str(person_id),
        "person_name": name,
        "id_label": id_label,
        "leave_type": str(leave_type).strip(),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "days": (end - start).days + 1,
        "reason": (reason or "").strip(),
        "status": "pending",
        "review_note": "",
        "reviewed_by": "",
        "reviewed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    result = db.leave_requests.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc), None


def _build_query(status=None, person_type=None, person_id=None, search=None):
    query = {}
    if status and status in STATUSES:
        query["status"] = status
    if person_type:
        query["person_type"] = str(person_type).lower()
    if person_id:
        query["person_id"] = str(person_id)
    if search:
        term = str(search).strip()
        if term:
            query["person_name"] = {"$regex": term, "$options": "i"}
    return query


def list_leave_requests(status=None, person_type=None, person_id=None, search=None, limit=500):
    db = get_db()
    if db is None:
        return []
    query = _build_query(status, person_type, person_id, search)
    docs = list(
        db.leave_requests.find(query).sort("created_at", -1).limit(int(limit))
    )
    return [serialize_doc(d) for d in docs]


def leave_stats(status=None, person_type=None, person_id=None, search=None):
    db = get_db()
    stats = {"pending": 0, "approved": 0, "rejected": 0, "total": 0}
    if db is None:
        return stats
    query = _build_query(status, person_type, person_id, search)
    for row in db.leave_requests.aggregate([
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        key = row.get("_id")
        if key in stats:
            stats[key] = row.get("count", 0)
    stats["total"] = stats["pending"] + stats["approved"] + stats["rejected"]
    return stats


def get_leave_request(leave_id):
    db = get_db()
    if db is None:
        return None
    doc = db.leave_requests.find_one({"_id": _to_oid(leave_id)})
    return serialize_doc(doc)


def set_leave_status(leave_id, status, review_note="", reviewed_by=""):
    """Approve or reject a pending request. Returns ``(doc, error, code)``."""
    db = get_db()
    if db is None:
        return None, "Database unavailable", 500
    if status not in ("approved", "rejected"):
        return None, "Invalid status", 400

    existing = db.leave_requests.find_one({"_id": _to_oid(leave_id)})
    if not existing:
        return None, "Leave request not found", 404
    if existing.get("status") != "pending":
        return None, "This leave request has already been reviewed", 409

    now = datetime.utcnow()
    db.leave_requests.update_one(
        {"_id": existing["_id"]},
        {"$set": {
            "status": status,
            "review_note": (review_note or "").strip(),
            "reviewed_by": reviewed_by or "admin",
            "reviewed_at": now,
            "updated_at": now,
        }},
    )

    marked = 0
    if status == "approved":
        from backend.models.attendance_model import mark_leave_range
        marked = mark_leave_range(
            existing.get("person_type", "employee"),
            existing.get("person_id"),
            existing.get("start_date"),
            existing.get("end_date"),
        ).get("marked", 0)

    updated = db.leave_requests.find_one({"_id": existing["_id"]})
    result = serialize_doc(updated)
    if isinstance(result, dict):
        result["marked"] = marked
    return result, None, 200

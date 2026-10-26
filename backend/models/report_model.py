"""Daily work-progress reports submitted by employees and interns.

Each person may submit one report per work date. The report captures what they
worked on that day and is visible both to the submitter (mobile) and to
administrators (web dashboard). A nightly push reminder nudges anyone who has
not yet submitted for the current day.
"""
from datetime import datetime
from bson import ObjectId
from backend.db import get_db, serialize_doc


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _normalize_type(person_type):
    ptype = (person_type or "employee").strip().lower()
    return ptype if ptype in ("employee", "intern") else "employee"


def _today():
    return datetime.utcnow().date().isoformat()


def add_report(person_type, person_id, date, content, tasks_done=None, hours=None):
    """Create or update the daily report for one person on one date.

    Returns the serialized document, or None on failure.
    """
    db = get_db()
    if db is None or not person_id:
        return None
    ptype = _normalize_type(person_type)
    date = (date or _today()).strip()
    now = datetime.utcnow()
    payload = {
        "person_type": ptype,
        "person_id": str(person_id),
        "date": date,
        "content": (content or "").strip(),
        "tasks_done": list(tasks_done or []),
        "hours": hours,
        "status": "submitted",
        "submitted_at": now,
        "updated_at": now,
    }
    result = db.daily_reports.update_one(
        {"person_type": ptype, "person_id": str(person_id), "date": date},
        {"$set": payload, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    doc = db.daily_reports.find_one(
        {"person_type": ptype, "person_id": str(person_id), "date": date}
    )
    return serialize_doc(doc) if doc else None


def get_report(report_id):
    """Raw report document by id, or None."""
    db = get_db()
    if db is None:
        return None
    return db.daily_reports.find_one({"_id": _to_oid(report_id)})


def get_report_for_person(person_type, person_id, date):
    """Raw report document for one person on one date, or None."""
    db = get_db()
    if db is None or not person_id:
        return None
    return db.daily_reports.find_one({
        "person_type": _normalize_type(person_type),
        "person_id": str(person_id),
        "date": date,
    })


def list_reports(person_type=None, person_id=None, date=None, start_date=None,
                 end_date=None):
    """List reports with optional filters, newest first."""
    db = get_db()
    if db is None:
        return []
    query = {}
    if person_type:
        query["person_type"] = _normalize_type(person_type)
    if person_id:
        query["person_id"] = str(person_id)
    if date:
        query["date"] = date
    elif start_date or end_date:
        range_query = {}
        if start_date:
            range_query["$gte"] = start_date
        if end_date:
            range_query["$lte"] = end_date
        query["date"] = range_query
    docs = list(db.daily_reports.find(query).sort("date", -1))
    return [serialize_doc(doc) for doc in docs]


def reports_for_person(person_id, person_type="employee"):
    """All reports submitted by one person, newest first."""
    return list_reports(person_type=person_type, person_id=person_id)


def submitted_today(person_type, person_id, date=None):
    """True when a report already exists for the person on the given date."""
    return get_report_for_person(person_type, person_id, date or _today()) is not None

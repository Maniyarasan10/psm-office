from datetime import datetime
from bson import ObjectId
from pymongo import ReturnDocument
from backend.db import get_db, serialize_doc


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _resolve_assigned_name(db, doc):
    """Look up assigned person name from employees or interns."""
    assigned_to = doc.get("assigned_to")
    if not assigned_to:
        return ""
    oid = _to_oid(assigned_to)
    if isinstance(oid, str):
        return ""
    assigned_type = doc.get("assigned_type", "employee")
    if assigned_type == "intern":
        person = db.interns.find_one({"_id": oid})
    else:
        person = db.employees.find_one({"_id": oid})
    return person.get("name", "") if person else ""


def _resolve_created_by_name(db, doc):
    """Name of the person who created/assigned the task.

    Admin-created tasks store ``created_by`` as "admin" (or omit it), so they
    resolve to "Administrator". Team-lead-created tasks store the lead's person
    id, which is looked up across employees and interns.
    """
    created_by = doc.get("created_by")
    if not created_by:
        return "Administrator"
    if str(created_by).lower() in ("admin", "administrator"):
        return "Administrator"
    oid = _to_oid(created_by)
    if isinstance(oid, str):
        return ""
    person = db.employees.find_one({"_id": oid}) or db.interns.find_one({"_id": oid})
    return person.get("name", "") if person else ""


def _decorate(db, doc):
    """Serialize a raw task and attach resolved display names."""
    serialized = serialize_doc(doc)
    serialized["assigned_to_name"] = _resolve_assigned_name(db, doc)
    serialized["created_by_name"] = _resolve_created_by_name(db, doc)
    return serialized


def all_tasks(search=None):
    db = get_db()
    query = {}
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"status": {"$regex": search, "$options": "i"}},
        ]
    docs = list(db.tasks.find(query).sort("created_at", -1))
    return [_decorate(db, doc) for doc in docs]


def get_task(task_id):
    """Raw task document (not serialized), or None when it does not exist."""
    db = get_db()
    return db.tasks.find_one({"_id": _to_oid(task_id)})


def add_task(data):
    db = get_db()
    data["created_at"] = datetime.utcnow()
    data["updated_at"] = datetime.utcnow()
    result = db.tasks.insert_one(data)
    return str(result.inserted_id)


def update_task(task_id, data):
    db = get_db()
    data["updated_at"] = datetime.utcnow()
    db.tasks.update_one({"_id": _to_oid(task_id)}, {"$set": data})


def delete_task(task_id):
    db = get_db()
    db.tasks.delete_one({"_id": _to_oid(task_id)})


def add_task_comment(task_id, comment):
    """Append a message to the task and return the updated task, serialized."""
    db = get_db()
    doc = db.tasks.find_one_and_update(
        {"_id": _to_oid(task_id)},
        {"$push": {"comments": comment}, "$set": {"updated_at": datetime.utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _decorate(db, doc)


def task_counts():
    db = get_db()
    pending = db.tasks.count_documents({"status": "Pending"})
    in_progress = db.tasks.count_documents({"status": "In Progress"})
    completed = db.tasks.count_documents({"status": "Completed"})
    return {
        "pending": pending,
        "in_progress": in_progress,
        "completed": completed,
    }


def tasks_for_person(person_id, person_type="employee"):
    db = get_db()
    pid = _to_oid(person_id)
    id_match = {"$or": [{"assigned_to": pid}, {"assigned_to": person_id}]}
    if person_type == "intern":
        type_match = {"assigned_type": "intern"}
    else:
        type_match = {"$or": [{"assigned_type": "employee"}, {"assigned_type": {"$exists": False}}]}
    docs = list(db.tasks.find({"$and": [id_match, type_match]}).sort("created_at", -1))
    return [_decorate(db, doc) for doc in docs]


def upcoming_tasks(limit=8):
    db = get_db()
    docs = list(
        db.tasks.find({"status": {"$ne": "Completed"}})
        .sort("deadline", 1)
        .limit(limit)
    )
    return [_decorate(db, doc) for doc in docs]

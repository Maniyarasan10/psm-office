from datetime import datetime
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from backend.db import get_db, serialize_doc


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _resolve_mentor(db, mentor_id):
    if not mentor_id:
        return None
    m = db.employees.find_one({"_id": _to_oid(mentor_id)})
    if not m:
        m = db.employees.find_one({"employee_id": mentor_id})
    return serialize_doc(m) if m else None


def _apply_mentor(db, intern, overwrite=False):
    """Attach the mentor's live contact details to an intern document."""
    mentor_id = intern.get("mentor_id")
    if not mentor_id:
        return intern
    mentor = _resolve_mentor(db, mentor_id)
    if not mentor:
        return intern
    fields = {
        "mentor_name": mentor.get("name"),
        "mentor_email": mentor.get("email"),
        "mentor_phone": mentor.get("phone"),
        "mentor_department": mentor.get("department"),
        "mentor_designation": mentor.get("designation"),
    }
    for key, value in fields.items():
        if overwrite or not intern.get(key):
            intern[key] = value
    return intern


def all_interns(search=None):
    db = get_db()
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"intern_id": {"$regex": search, "$options": "i"}},
            {"college": {"$regex": search, "$options": "i"}},
            {"department": {"$regex": search, "$options": "i"}},
            {"mentor_name": {"$regex": search, "$options": "i"}},
        ]
    docs = list(db.interns.find(query, {"password_hash": 0}).sort("created_at", -1))
    interns = [serialize_doc(d) for d in docs]
    return [_apply_mentor(db, i) for i in interns]


def add_intern(data):
    db = get_db()
    data["created_at"] = datetime.utcnow()
    data["updated_at"] = datetime.utcnow()
    if "password" in data and data["password"]:
        data["password_hash"] = generate_password_hash(data.pop("password"))
    if data.get("mentor_id") and not data.get("mentor_name"):
        _apply_mentor(db, data, overwrite=True)
    result = db.interns.insert_one(data)
    return str(result.inserted_id)


def update_intern(intern_id, data):
    db = get_db()
    safe_data = dict(data)
    safe_data.pop("_id", None)
    safe_data["updated_at"] = datetime.utcnow()
    if "password" in safe_data:
        if safe_data["password"]:
            safe_data["password_hash"] = generate_password_hash(safe_data.pop("password"))
        else:
            safe_data.pop("password")
    if safe_data.get("mentor_id") and not safe_data.get("mentor_name"):
        _apply_mentor(db, safe_data, overwrite=True)
    db.interns.update_one({"_id": _to_oid(intern_id)}, {"$set": safe_data})


def delete_intern(intern_id):
    db = get_db()
    db.interns.delete_one({"_id": _to_oid(intern_id)})


def count_interns():
    db = get_db()
    return db.interns.count_documents({})


def verify_intern_password(intern_id, raw_password):
    db = get_db()
    intern = db.interns.find_one({"intern_id": intern_id})
    if not intern:
        intern = db.interns.find_one({"_id": _to_oid(intern_id)})
    if not intern:
        return None
    password_hash = intern.get("password_hash", "")
    if not password_hash:
        return None
    if check_password_hash(password_hash, raw_password):
        _apply_mentor(db, intern)
        return serialize_doc(intern)
    return None


def set_intern_password(intern_id, raw_password):
    db = get_db()
    password_hash = generate_password_hash(raw_password)
    db.interns.update_one(
        {"intern_id": intern_id},
        {"$set": {"password_hash": password_hash}}
    )


def get_intern_by_id(intern_id):
    db = get_db()
    intern = db.interns.find_one({"intern_id": intern_id}, {"password_hash": 0})
    if not intern:
        intern = db.interns.find_one(
            {"_id": _to_oid(intern_id)}, {"password_hash": 0}
        )
    if not intern:
        return None
    _apply_mentor(db, intern)
    return serialize_doc(intern)

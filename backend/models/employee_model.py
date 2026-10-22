from datetime import datetime
from bson import ObjectId
from backend.db import get_db, serialize_doc


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def all_employees(search=None):
    db = get_db()
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"employee_id": {"$regex": search, "$options": "i"}},
            {"department": {"$regex": search, "$options": "i"}},
            {"designation": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    # The password hash is never sent to a client and only makes the
    # documents heavier on the wire.
    docs = list(
        db.employees.find(query, {"password_hash": 0}).sort("created_at", -1)
    )
    return [serialize_doc(d) for d in docs]


def get_employee(employee_id):
    db = get_db()
    doc = db.employees.find_one(
        {"_id": _to_oid(employee_id)}, {"password_hash": 0}
    )
    return serialize_doc(doc)


def add_employee(data):
    db = get_db()
    data["created_at"] = datetime.utcnow()
    data["updated_at"] = datetime.utcnow()
    result = db.employees.insert_one(data)
    return str(result.inserted_id)


def update_employee(employee_id, data):
    db = get_db()
    safe_data = dict(data)
    safe_data.pop("_id", None)
    safe_data["updated_at"] = datetime.utcnow()
    db.employees.update_one({"_id": _to_oid(employee_id)}, {"$set": safe_data})


def delete_employee(employee_id):
    db = get_db()
    db.employees.delete_one({"_id": _to_oid(employee_id)})


def count_employees():
    db = get_db()
    return db.employees.count_documents({})


def count_active_employees():
    db = get_db()
    return db.employees.count_documents({"status": "Active"})


def upcoming_birthdays(days=30):
    from datetime import timedelta, date as date_type
    db = get_db()
    today = date_type.today()
    employees = list(db.employees.find({"dob": {"$ne": None, "$ne": ""}}))
    result = []
    for emp in employees:
        try:
            dob_str = emp.get("dob", "")
            if not dob_str:
                continue
            dob = date_type.fromisoformat(dob_str)
            this_year_birthday = dob.replace(year=today.year)
            if this_year_birthday < today:
                this_year_birthday = dob.replace(year=today.year + 1)
            delta = (this_year_birthday - today).days
            if 0 <= delta <= days:
                result.append({
                    "name": emp["name"],
                    "employee_id": emp.get("employee_id", ""),
                    "dob": dob_str,
                    "days_until": delta,
                    "birthday": this_year_birthday.isoformat(),
                })
        except (ValueError, TypeError):
            continue
    result.sort(key=lambda x: x["days_until"])
    return result

from werkzeug.security import generate_password_hash, check_password_hash
from backend.db import get_db, serialize_doc


def set_password(employee_id, raw_password):
    db = get_db()
    password_hash = generate_password_hash(raw_password)
    db.employees.update_one(
        {"employee_id": employee_id},
        {"$set": {"password_hash": password_hash}}
    )


def verify_password(employee_id, raw_password):
    db = get_db()
    emp = db.employees.find_one({"employee_id": employee_id})
    if not emp:
        return None
    password_hash = emp.get("password_hash", "")
    if not password_hash:
        return None
    if check_password_hash(password_hash, raw_password):
        return serialize_doc(emp)
    return None


def get_employee_by_id(employee_id):
    db = get_db()
    emp = db.employees.find_one({"employee_id": employee_id})
    return serialize_doc(emp)

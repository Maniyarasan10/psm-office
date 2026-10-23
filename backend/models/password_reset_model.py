"""Email-OTP based password reset.

A short one-time code is emailed to the person; only its hash is stored. Codes
expire after ``PASSWORD_OTP_TTL_SECONDS`` (10 minutes by default), allow a small
number of attempts, and are single-use.
"""
import secrets
from datetime import datetime, timedelta

from werkzeug.security import check_password_hash, generate_password_hash

from backend import config
from backend.db import get_db

_MAX_ATTEMPTS = 5


def find_person(identifier):
    """Look up an employee or intern by their login ID.

    Returns ``{person_type, identifier, name, email}`` or ``None``.
    """
    identifier = (identifier or "").strip()
    if not identifier:
        return None
    db = get_db()

    employee = db.employees.find_one({"employee_id": identifier})
    if employee:
        return {
            "_id": str(employee.get("_id", "")),
            "person_type": "employee",
            "identifier": employee.get("employee_id", identifier),
            "name": employee.get("name", ""),
            "email": employee.get("email", ""),
        }

    intern = db.interns.find_one({"intern_id": identifier})
    if intern:
        return {
            "_id": str(intern.get("_id", "")),
            "person_type": "intern",
            "identifier": intern.get("intern_id", identifier),
            "name": intern.get("name", ""),
            "email": intern.get("email", ""),
        }
    return None


def generate_otp():
    """A 6-digit numeric code (zero-padded, cryptographically random)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def create_otp(identifier, person_type, otp):
    """Store a fresh OTP for the identifier, replacing any earlier one."""
    db = get_db()
    identifier = (identifier or "").strip()
    db.password_resets.update_many(
        {"identifier": identifier, "used": False},
        {"$set": {"used": True, "invalidated_at": datetime.utcnow()}},
    )
    db.password_resets.insert_one(
        {
            "identifier": identifier,
            "person_type": person_type,
            "otp_hash": generate_password_hash(otp),
            "attempts": 0,
            "used": False,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(seconds=config.otp_ttl_seconds()),
        }
    )


def verify_otp(identifier, otp):
    """Validate an OTP. Returns its record dict on success, else ``None``.

    A successful verification marks the code used so it cannot be replayed.
    """
    db = get_db()
    identifier = (identifier or "").strip()
    otp = (otp or "").strip()
    if not identifier or not otp:
        return None

    record = db.password_resets.find_one(
        {"identifier": identifier, "used": False}, sort=[("created_at", -1)]
    )
    if not record:
        return None
    if record.get("expires_at") and record["expires_at"] < datetime.utcnow():
        return None
    if int(record.get("attempts", 0)) >= _MAX_ATTEMPTS:
        return None
    if not check_password_hash(record.get("otp_hash", ""), otp):
        db.password_resets.update_one(
            {"_id": record["_id"]}, {"$inc": {"attempts": 1}}
        )
        return None

    db.password_resets.update_one(
        {"_id": record["_id"]},
        {"$set": {"used": True, "used_at": datetime.utcnow()}},
    )
    return record

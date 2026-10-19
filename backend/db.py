import os
from bson import ObjectId
from pymongo import MongoClient
from pymongo.errors import ConfigurationError, ConnectionFailure, OperationFailure, ServerSelectionTimeoutError
from datetime import datetime, date
from backend import config

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        uri = config.mongo_uri()
        try:
            _client = MongoClient(uri, serverSelectionTimeoutMS=2000)
            db_name = config.db_name()
            _db = _client.get_database(db_name)
            _ensure_indexes()
        except (ConfigurationError, ConnectionFailure, OperationFailure, ServerSelectionTimeoutError) as exc:
            _client = None
            _db = None
            if os.getenv("FLASK_ENV", "").lower() == "production":
                raise RuntimeError(f"Could not connect to MongoDB at startup: {exc}") from exc
            print(f"MongoDB unavailable, continuing without database: {exc}")
    return _db


def _ensure_indexes():
    db = _db
    db.employees.create_index("employee_id", unique=True)
    db.interns.create_index("intern_id", unique=True)
    db.attendance.create_index(
        [("person_type", 1), ("person_id", 1), ("date", 1)], unique=True
    )
    db.attendance.create_index("date")
    db.leave_requests.create_index("status")
    db.leave_requests.create_index("person_id")
    db.leave_requests.create_index("created_at")
    db.tasks.create_index("status")
    db.projects.create_index("status")
    db.projects.create_index("created_at")
    db.documents.create_index("category")
    db.finance.create_index("date")
    db.finance.create_index("type")
    db.finance.create_index("transaction_id")
    db.settings.create_index("key", unique=True)
    db.support_tickets.create_index("ticket_number", unique=True)
    db.support_tickets.create_index("person_id")
    db.support_tickets.create_index("status")
    db.support_tickets.create_index("created_at")
    db.notifications.create_index([("person_type", 1), ("person_id", 1), ("created_at", -1)])
    db.notifications.create_index("dedupe_key")
    db.announcements.create_index("created_at")
    _seed_settings(db)


def _seed_settings(db):
    defaults = {
        "company_name": "PSM",
        "company_logo": "",
        "office_start": "09:30",
        "office_end": "18:30",
        "theme": "light",
        "office_latitude": "",
        "office_longitude": "",
        "allowed_radius_km": "5.0",
        "support_categories": (
            "IT / Technical,HR & Payroll,Facilities & Office,Attendance & Leave,General"
        ),
    }
    for key, value in defaults.items():
        if not db.settings.find_one({"key": key}):
            db.settings.insert_one({"key": key, "value": value})


class JSONEncoder:
    @staticmethod
    def default(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return str(obj)


def serialize_doc(doc):
    if doc is None:
        return None
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, datetime):
            doc[key] = value.isoformat()
        elif isinstance(value, date):
            doc[key] = value.isoformat()
        elif isinstance(value, dict):
            doc[key] = serialize_doc(value)
        elif isinstance(value, list):
            doc[key] = [
                serialize_doc(item) if isinstance(item, dict) else (str(item) if isinstance(item, ObjectId) else item)
                for item in value
            ]
    return doc

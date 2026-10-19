"""Ascending, human-readable IDs for employees and interns.

IDs are sequential and zero-padded (``PSM001``, ``PSM002`` …, interns use a
``PSM-I###`` prefix). The next value is derived from the highest existing ID in
the collection plus an atomic counter, so IDs keep climbing even after records
are deleted and never collide with manually entered ones.
"""
import re

from backend.db import get_db

EMPLOYEE_PREFIX = "PSM"
INTERN_PREFIX = "PSM-I"
_EMPLOYEE_PATTERN = re.compile(rf"^{re.escape(EMPLOYEE_PREFIX)}(\d+)$")
_INTERN_PATTERN = re.compile(rf"^{re.escape(INTERN_PREFIX)}(\d+)$")


def _max_suffix(collection_name, pattern, field):
    db = get_db()
    highest = 0
    for doc in db[collection_name].find({field: {"$exists": True}}, {field: 1}):
        value = str(doc.get(field) or "")
        match = pattern.match(value)
        if match:
            highest = max(highest, int(match.group(1)))
    return highest


def _counter_value(key):
    db = get_db()
    doc = db.counters.find_one({"_id": key}) or {}
    try:
        return int(doc.get("seq", 0))
    except (TypeError, ValueError):
        return 0


def _reserve(key, floor):
    """Atomically advance ``key`` past ``floor`` and return the new value."""
    db = get_db()
    db.counters.update_one({"_id": key}, {"$max": {"seq": floor}}, upsert=True)
    doc = db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return int(doc.get("seq", floor + 1))


def peek_employee_id():
    """The ID that the next employee will receive (does not reserve it)."""
    floor = max(_max_suffix("employees", _EMPLOYEE_PATTERN, "employee_id"), _counter_value("employee_id"))
    return f"{EMPLOYEE_PREFIX}{floor + 1:03d}"


def next_employee_id():
    floor = max(_max_suffix("employees", _EMPLOYEE_PATTERN, "employee_id"), _counter_value("employee_id"))
    return f"{EMPLOYEE_PREFIX}{_reserve('employee_id', floor):03d}"


def peek_intern_id():
    """The ID that the next intern will receive (does not reserve it)."""
    floor = max(_max_suffix("interns", _INTERN_PATTERN, "intern_id"), _counter_value("intern_id"))
    return f"{INTERN_PREFIX}{floor + 1:03d}"


def next_intern_id():
    floor = max(_max_suffix("interns", _INTERN_PATTERN, "intern_id"), _counter_value("intern_id"))
    return f"{INTERN_PREFIX}{_reserve('intern_id', floor):03d}"

import re
from datetime import datetime
from bson import ObjectId
from backend.db import get_db, serialize_doc


PROJECT_STATUSES = ("Ongoing", "On Hold", "Completed")


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _collection_for(person_type):
    db = get_db()
    return db.interns if person_type == "intern" else db.employees


def person_exists(person_id, person_type="employee"):
    """True when the person id resolves to an employee or intern record."""
    if not person_id:
        return False
    collection = _collection_for(person_type)
    return collection.find_one({"_id": _to_oid(person_id)}, {"_id": 1}) is not None


def _resolve_person(person_id, person_type="employee"):
    """Enrich a stored person reference with display fields, or None."""
    if not person_id:
        return None
    collection = _collection_for(person_type)
    person = collection.find_one({"_id": _to_oid(person_id)})
    if not person:
        return None
    return {
        "person_id": str(person.get("_id")),
        "person_type": person_type,
        "name": person.get("name", ""),
        "code": person.get("employee_id") or person.get("intern_id") or "",
        "department": person.get("department", ""),
        "designation": person.get("designation", ""),
    }


def _normalize_members(raw_members):
    """Keep only well-formed, unique {person_id, person_type} entries."""
    members = []
    seen = set()
    for member in raw_members or []:
        if not isinstance(member, dict):
            continue
        person_id = member.get("person_id") or member.get("id")
        person_type = member.get("person_type") or member.get("type") or "employee"
        if person_type not in ("employee", "intern"):
            person_type = "employee"
        if not person_id:
            continue
        key = (str(person_id), person_type)
        if key in seen:
            continue
        seen.add(key)
        members.append({"person_id": str(person_id), "person_type": person_type})
    return members


def _normalize_allowed_intern_ids(raw_ids):
    """Keep unique, non-empty intern ids as plain strings."""
    allowed = []
    seen = set()
    for value in raw_ids or []:
        if value is None:
            continue
        intern_id = str(value).strip()
        if not intern_id or intern_id in seen:
            continue
        seen.add(intern_id)
        allowed.append(intern_id)
    return allowed


def is_team_lead(project, person_id, person_type="employee"):
    """True when the given person is the project's assigned team lead."""
    if not project or not person_id:
        return False
    lead_id = str(project.get("team_lead_id") or "")
    if lead_id != str(person_id):
        return False
    lead_type = project.get("team_lead_type") or "employee"
    return lead_type == (person_type or "employee")


def _viewer_is_restricted_intern(viewer):
    """Only token-carrying interns are subject to confidentiality gating."""
    if not viewer:
        return False
    if viewer.get("role") == "admin":
        return False
    return viewer.get("person_type") == "intern"


def project_visible_to(project, viewer):
    """Confidential projects are hidden from interns unless explicitly allowed."""
    if not project.get("is_confidential"):
        return True
    if not _viewer_is_restricted_intern(viewer):
        return True
    allowed = {str(value) for value in (project.get("allowed_intern_ids") or [])}
    return str(viewer.get("person_id") or "") in allowed


def _enrich(doc):
    """Serialize a project document and attach resolved people details."""
    serialized = serialize_doc(doc)
    lead = _resolve_person(doc.get("team_lead_id"), doc.get("team_lead_type", "employee"))
    serialized["team_lead_name"] = lead["name"] if lead else ""

    resolved = [
        _resolve_person(member.get("person_id"), member.get("person_type", "employee"))
        for member in doc.get("members", [])
    ]
    serialized["members_detail"] = [person for person in resolved if person]
    serialized["member_count"] = len(serialized["members_detail"])
    return serialized


def all_projects(search=None, status=None, viewer=None):
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"status": {"$regex": search, "$options": "i"}},
        ]
    docs = list(db.projects.find(query).sort("created_at", -1))
    return [_enrich(doc) for doc in docs if project_visible_to(doc, viewer)]


def get_project(project_id):
    db = get_db()
    doc = db.projects.find_one({"_id": _to_oid(project_id)})
    return _enrich(doc) if doc else None


def add_project(data):
    db = get_db()
    data["members"] = _normalize_members(data.get("members"))
    data["allowed_intern_ids"] = _normalize_allowed_intern_ids(data.get("allowed_intern_ids"))
    data["created_at"] = datetime.utcnow()
    data["updated_at"] = datetime.utcnow()
    result = db.projects.insert_one(data)
    return str(result.inserted_id)


def update_project(project_id, data):
    db = get_db()
    safe_data = dict(data)
    if "members" in safe_data:
        safe_data["members"] = _normalize_members(safe_data.get("members"))
    if "allowed_intern_ids" in safe_data:
        safe_data["allowed_intern_ids"] = _normalize_allowed_intern_ids(
            safe_data.get("allowed_intern_ids")
        )
    safe_data.pop("_id", None)
    safe_data["updated_at"] = datetime.utcnow()
    db.projects.update_one({"_id": _to_oid(project_id)}, {"$set": safe_data})


def update_project_status(project_id, status, progress):
    """Update only the status/progress fields (used by the project lead)."""
    db = get_db()
    db.projects.update_one(
        {"_id": _to_oid(project_id)},
        {"$set": {"status": status, "progress": progress, "updated_at": datetime.utcnow()}},
    )


def set_project_members(project_id, members):
    """Replace the member list (used by the project lead or an admin)."""
    db = get_db()
    cleaned = _normalize_members(members)
    db.projects.update_one(
        {"_id": _to_oid(project_id)},
        {"$set": {"members": cleaned, "updated_at": datetime.utcnow()}},
    )
    return cleaned


def delete_project(project_id):
    db = get_db()
    db.projects.delete_one({"_id": _to_oid(project_id)})


def project_status_counts():
    db = get_db()
    return {status: db.projects.count_documents({"status": status}) for status in PROJECT_STATUSES}


def get_project_by_title(title):
    """Find a project by title (case-insensitive, exact match). Returns the doc or None."""
    if not title:
        return None
    db = get_db()
    return db.projects.find_one({"title": {"$regex": f"^{re.escape(title.strip())}$", "$options": "i"}})


def add_project_member(project_id, person_id, person_type="employee"):
    """Append a person to a project's member list without replacing it."""
    db = get_db()
    project = db.projects.find_one({"_id": _to_oid(project_id)})
    if not project:
        return None
    members = _normalize_members(project.get("members") or [])
    key = (str(person_id), person_type)
    if any((m["person_id"], m["person_type"]) == key for m in members):
        return members
    members.append({"person_id": str(person_id), "person_type": person_type})
    db.projects.update_one(
        {"_id": _to_oid(project_id)},
        {"$set": {"members": members, "updated_at": datetime.utcnow()}},
    )
    return members


def remove_project_member(project_id, person_id, person_type="employee"):
    """Remove a person from a project's member list."""
    db = get_db()
    project = db.projects.find_one({"_id": _to_oid(project_id)})
    if not project:
        return None
    members = _normalize_members(project.get("members") or [])
    key = (str(person_id), person_type)
    filtered = [m for m in members if (m["person_id"], m["person_type"]) != key]
    if len(filtered) == len(members):
        return members
    db.projects.update_one(
        {"_id": _to_oid(project_id)},
        {"$set": {"members": filtered, "updated_at": datetime.utcnow()}},
    )
    return filtered

from bson import ObjectId
from flask import Blueprint, request, jsonify

from backend.models.project_model import (
    PROJECT_STATUSES,
    all_projects,
    get_project,
    add_project,
    update_project,
    delete_project,
    update_project_status,
    set_project_members,
    project_status_counts,
    project_visible_to,
    is_team_lead,
    person_exists,
)
from backend.models.task_model import add_task
from backend.utils.activity_log import log_activity
from backend.utils.auth import admin_required, auth_required, current_auth
from backend.utils.notify import notify_person

project_bp = Blueprint("projects", __name__)

TITLE_MAX = 200
DESCRIPTION_MAX = 5000
MAX_MEMBERS = 100
DEFAULT_STATUS = "Ongoing"
TASK_TITLE_MAX = 200
TASK_DESCRIPTION_MAX = 5000
TASK_PRIORITIES = ("High", "Medium", "Low")


def _viewer():
    """Identity of the caller for visibility checks, or None when anonymous."""
    auth = current_auth()
    if not auth:
        return None
    return {
        "person_id": auth.get("sub"),
        "person_type": auth.get("person_type") or "employee",
        "role": auth.get("role"),
    }


def _notify_new_members(project, before, members, viewer):
    """Notify people who were just added to a project (skip the actor)."""
    actor_id = str((viewer or {}).get("person_id") or "")
    title = project.get("title", "a project")
    for member in members:
        person_id = str(member.get("person_id") or "")
        person_type = member.get("person_type") or "employee"
        if not person_id or (person_id, person_type) in before:
            continue
        if person_id == actor_id and person_type == (viewer or {}).get("person_type"):
            continue
        notify_person(
            person_type,
            person_id,
            "Added to project",
            body=f"You were added to {title}",
            route="work",
            category="Projects",
            ref_id=project.get("_id"),
            dedupe_key=f"project:{project.get('_id')}:member:{person_id}",
        )


def _notify_project_status(project, status, viewer):
    """Tell every team member that a project's status changed (skip the actor)."""
    actor_id = str((viewer or {}).get("person_id") or "")
    title = project.get("title", "Project")
    for member in project.get("members") or []:
        person_id = str(member.get("person_id") or "")
        person_type = member.get("person_type") or "employee"
        if not person_id:
            continue
        if person_id == actor_id and person_type == (viewer or {}).get("person_type"):
            continue
        notify_person(
            person_type,
            person_id,
            "Project status updated",
            body=f"{title} is now {status}",
            route="work",
            category="Projects",
            ref_id=project.get("_id"),
            dedupe_key=f"project:{project.get('_id')}:status:{status}",
        )


def _coerce_progress(value, default=0):
    """Return an int 0-100, or None when the value is out of range/unusable."""
    if value in (None, ""):
        return default
    try:
        progress = int(value)
    except (TypeError, ValueError):
        return None
    if progress < 0 or progress > 100:
        return None
    return progress


def _validate_team_lead(data):
    """Return (person_id, person_type, error)."""
    lead_id = str(data.get("team_lead_id") or "").strip()
    if not lead_id:
        return "", "employee", None
    lead_type = (data.get("team_lead_type") or "employee").strip()
    if lead_type not in ("employee", "intern"):
        lead_type = "employee"
    if not person_exists(lead_id, lead_type):
        return None, None, "Team lead not found"
    return lead_id, lead_type, None


def _validate_members(data):
    """Return (members, error). Each entry is {person_id, person_type}."""
    raw = data.get("members") or []
    if not isinstance(raw, list):
        return None, "members must be a list"
    members = []
    for member in raw:
        if not isinstance(member, dict):
            continue
        person_id = str(member.get("person_id") or "").strip()
        person_type = (member.get("person_type") or "employee").strip()
        if person_type not in ("employee", "intern"):
            person_type = "employee"
        if not person_id:
            continue
        if not person_exists(person_id, person_type):
            return None, "One or more selected members were not found"
        members.append({"person_id": person_id, "person_type": person_type})
    if len(members) > MAX_MEMBERS:
        return None, f"A project can have at most {MAX_MEMBERS} members"
    return members, None


def _validate_allowed_intern_ids(data):
    """Return (allowed_ids, error). Each id must resolve to an intern record."""
    raw = data.get("allowed_intern_ids") or []
    if not isinstance(raw, list):
        return None, "allowed_intern_ids must be a list"
    allowed = []
    seen = set()
    for value in raw:
        intern_id = str(value or "").strip()
        if not intern_id or intern_id in seen:
            continue
        if not person_exists(intern_id, "intern"):
            return None, "One or more selected interns were not found"
        seen.add(intern_id)
        allowed.append(intern_id)
    return allowed, None


def _build_payload(data):
    """Validate a create/update body and return (payload, error)."""
    title = (data.get("title") or "").strip()
    if not title:
        return None, "Project title is required"
    if len(title) > TITLE_MAX:
        return None, f"Title must be under {TITLE_MAX} characters"

    description = (data.get("description") or "").strip()
    if len(description) > DESCRIPTION_MAX:
        return None, f"Description must be under {DESCRIPTION_MAX} characters"

    status = (data.get("status") or DEFAULT_STATUS).strip()
    if status not in PROJECT_STATUSES:
        return None, "Invalid status"

    progress = _coerce_progress(data.get("progress"), default=0)
    if progress is None:
        return None, "Progress must be a number between 0 and 100"

    team_lead_id, team_lead_type, lead_error = _validate_team_lead(data)
    if lead_error:
        return None, lead_error

    members, members_error = _validate_members(data)
    if members_error:
        return None, members_error

    is_confidential = bool(data.get("is_confidential"))

    allowed_intern_ids = []
    if is_confidential:
        allowed_intern_ids, allowed_error = _validate_allowed_intern_ids(data)
        if allowed_error:
            return None, allowed_error

    return {
        "title": title,
        "description": description,
        "status": status,
        "progress": progress,
        "team_lead_id": team_lead_id,
        "team_lead_type": team_lead_type,
        "members": members,
        "is_confidential": is_confidential,
        "allowed_intern_ids": allowed_intern_ids,
        "start_date": str(data.get("start_date") or "").strip(),
        "deadline": str(data.get("deadline") or "").strip(),
    }, None


@project_bp.route("/api/projects", methods=["GET"])
@auth_required
def list_projects():
    search = request.args.get("search")
    status = request.args.get("status")
    return jsonify(all_projects(search, status, _viewer()))


@project_bp.route("/api/projects/counts", methods=["GET"])
@admin_required
def project_counts():
    return jsonify(project_status_counts())


@project_bp.route("/api/projects/<project_id>", methods=["GET"])
@auth_required
def get_project_route(project_id):
    project = get_project(project_id)
    if project and project_visible_to(project, _viewer()):
        return jsonify(project)
    return jsonify({"error": "Not found"}), 404


@project_bp.route("/api/projects", methods=["POST"])
@admin_required
def create_project():
    payload, error = _build_payload(request.get_json() or {})
    if error:
        return jsonify({"error": error}), 400
    project_id = add_project(payload)
    log_activity("Project Created", payload["title"])
    return jsonify({"_id": project_id}), 201


@project_bp.route("/api/projects/<project_id>", methods=["PUT"])
@admin_required
def update_project_route(project_id):
    if not get_project(project_id):
        return jsonify({"error": "Not found"}), 404
    payload, error = _build_payload(request.get_json() or {})
    if error:
        return jsonify({"error": error}), 400
    update_project(project_id, payload)
    log_activity("Project Updated", payload["title"])
    return jsonify({"message": "Updated"})


@project_bp.route("/api/projects/<project_id>", methods=["DELETE"])
@admin_required
def delete_project_route(project_id):
    delete_project(project_id)
    log_activity("Project Deleted", project_id)
    return jsonify({"message": "Deleted"})


@project_bp.route("/api/projects/<project_id>/status", methods=["PUT"])
def update_project_status_route(project_id):
    """Project lead updates status/progress. Admin or lead only."""
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Not found"}), 404
    viewer = _viewer()
    if not viewer:
        return jsonify({"error": "Authentication required"}), 401
    is_lead = is_team_lead(project, viewer["person_id"], viewer["person_type"])
    if viewer.get("role") != "admin" and not is_lead:
        return jsonify({"error": "Only the project lead can update progress"}), 403

    data = request.get_json() or {}
    status = (data.get("status") or project.get("status") or DEFAULT_STATUS).strip()
    if status not in PROJECT_STATUSES:
        return jsonify({"error": "Invalid status"}), 400
    progress = _coerce_progress(data.get("progress"), default=project.get("progress", 0) or 0)
    if progress is None:
        return jsonify({"error": "Progress must be a number between 0 and 100"}), 400

    previous_status = (project.get("status") or DEFAULT_STATUS).strip()
    update_project_status(project_id, status, progress)
    log_activity(
        "Project Status Updated",
        f"{project.get('title', '')} -> {status} ({progress}%)",
    )
    if status != previous_status:
        _notify_project_status(project, status, viewer)
    return jsonify({"message": "Updated", "status": status, "progress": progress})


@project_bp.route("/api/projects/<project_id>/members", methods=["PUT"])
def update_project_members_route(project_id):
    """Project lead (or admin) adds/removes team members."""
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Not found"}), 404
    viewer = _viewer()
    if not viewer:
        return jsonify({"error": "Authentication required"}), 401
    is_lead = is_team_lead(project, viewer["person_id"], viewer["person_type"])
    if viewer.get("role") != "admin" and not is_lead:
        return jsonify({"error": "Only the project lead can manage members"}), 403

    members, error = _validate_members(request.get_json() or {})
    if error:
        return jsonify({"error": error}), 400
    before = {
        (str(m.get("person_id")), m.get("person_type") or "employee")
        for m in (project.get("members") or [])
    }
    cleaned = set_project_members(project_id, members)
    log_activity("Project Members Updated", project.get("title", ""))
    _notify_new_members(project, before, cleaned, viewer)
    return jsonify({"message": "Updated", "members": cleaned})


@project_bp.route("/api/projects/<project_id>/tasks", methods=["POST"])
def create_project_task_route(project_id):
    """Project lead (or admin) assigns a task to one of the team members.

    Tasks assigned here flow through the same inbox/push path as admin-created
    tasks, so the assignee sees them in the Tasks tab and in Notifications.
    """
    project = get_project(project_id)
    if not project:
        return jsonify({"error": "Not found"}), 404
    viewer = _viewer()
    if not viewer:
        return jsonify({"error": "Authentication required"}), 401
    is_lead = is_team_lead(project, viewer["person_id"], viewer["person_type"])
    if viewer.get("role") != "admin" and not is_lead:
        return jsonify({"error": "Only the project lead can assign tasks"}), 403

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Task title is required"}), 400
    if len(title) > TASK_TITLE_MAX:
        return jsonify({"error": f"Title must be under {TASK_TITLE_MAX} characters"}), 400

    description = (data.get("description") or "").strip()
    if len(description) > TASK_DESCRIPTION_MAX:
        return jsonify({"error": f"Description must be under {TASK_DESCRIPTION_MAX} characters"}), 400

    assignee_id = str(data.get("assigned_to") or "").strip()
    assignee_type = (data.get("assigned_type") or "employee").strip()
    if assignee_type not in ("employee", "intern"):
        assignee_type = "employee"
    if not assignee_id:
        return jsonify({"error": "Select a team member to assign this task to"}), 400

    member_keys = {
        (str(member.get("person_id")), member.get("person_type") or "employee")
        for member in (project.get("members") or [])
    }
    if (assignee_id, assignee_type) not in member_keys:
        return jsonify({"error": "Tasks can only be assigned to members of this project"}), 400

    priority = (data.get("priority") or "Medium").strip()
    if priority not in TASK_PRIORITIES:
        priority = "Medium"

    task_doc = {
        "title": title,
        "description": description,
        "assigned_to": ObjectId(assignee_id) if ObjectId.is_valid(assignee_id) else assignee_id,
        "assigned_type": assignee_type,
        "priority": priority,
        "deadline": str(data.get("deadline") or "").strip(),
        "status": "Pending",
        "remarks": "",
        "comments": [],
        "project_id": str(project.get("_id")),
        "project_name": project.get("title", ""),
        "created_by": str(viewer.get("person_id") or ""),
        "created_by_type": viewer.get("person_type") or "employee",
    }
    task_id = add_task(task_doc)
    log_activity("Task Assigned", f"{title} ({project.get('title', '')})")

    notify_person(
        assignee_type,
        assignee_id,
        "New task assigned",
        body=title,
        route="tasks",
        category="Tasks",
        ref_id=task_id,
        data={"route": "tasks", "taskId": task_id},
    )
    return jsonify({"_id": task_id}), 201

from datetime import datetime

from flask import Blueprint, request, jsonify
from bson import ObjectId
from backend.models.task_model import (
    all_tasks, add_task, update_task, delete_task, task_counts, upcoming_tasks,
    tasks_for_person, add_task_comment, get_task,
)
from backend.utils.activity_log import log_activity
from backend.utils.notify import notify_person
from backend.utils.auth import admin_required, auth_required

task_bp = Blueprint("tasks", __name__)

COMMENT_AUTHOR_TYPES = {"employee", "intern", "admin", "support"}
COMMENT_MAX_LENGTH = 5000


def _notify_assigned(task_doc, title, body, data=None):
    """Record (and best-effort push) a notification for the task's assignee.

    Silently skips unassigned tasks and people without a registered token.
    """
    if not task_doc or not task_doc.get("assigned_to"):
        return
    notify_person(
        task_doc.get("assigned_type", "employee"),
        task_doc.get("assigned_to"),
        title,
        body=body,
        route="tasks",
        category="Tasks",
        ref_id=task_doc.get("_id"),
        data=data,
    )


def _notify_task_creator(task_id):
    """Tell whoever assigned the task that it was completed.

    Admin-created tasks carry no ``created_by`` (or the literal "admin") and
    have no inbox to reach, so they are skipped.
    """
    doc = get_task(task_id)
    if not doc:
        return
    creator = str(doc.get("created_by") or "")
    if not creator or creator.lower() in ("admin", "administrator"):
        return
    if str(doc.get("assigned_to") or "") == creator:
        return
    notify_person(
        doc.get("created_by_type") or "employee",
        creator,
        "Task completed",
        body=doc.get("title", "A task you assigned was completed"),
        route="tasks",
        category="Tasks",
        ref_id=task_id,
        data={"route": "tasks", "taskId": task_id},
        dedupe_key=f"task:{task_id}:completed",
    )


@task_bp.route("/api/tasks", methods=["GET"])
@admin_required
def list_tasks():
    search = request.args.get("search")
    tasks = all_tasks(search)
    return jsonify(tasks)


@task_bp.route("/api/tasks", methods=["POST"])
@admin_required
def create_task():
    data = request.get_json()
    if data.get("assigned_to"):
        try:
            data["assigned_to"] = ObjectId(data["assigned_to"])
        except Exception:
            pass
    task_id = add_task(data)
    log_activity("Task Created", data.get("title", ""))
    _notify_assigned(
        get_task(task_id),
        "New task assigned",
        data.get("title", "You have a new task"),
        data={"route": "tasks", "taskId": task_id},
    )
    return jsonify({"_id": task_id}), 201


@task_bp.route("/api/tasks/<task_id>", methods=["PUT"])
@auth_required
def update_task_route(task_id):
    data = request.get_json()
    if data.get("assigned_to"):
        try:
            data["assigned_to"] = ObjectId(data["assigned_to"])
        except Exception:
            pass
    update_task(task_id, data)
    # The employee "Mark complete" action only sends {status}; the admin edit
    # form always includes assigned_to, so pushing here targets admin edits
    # (deadline, priority, reassignment) without echoing status changes back.
    if data.get("assigned_to"):
        doc = get_task(task_id)
        _notify_assigned(
            doc,
            "Task updated",
            (doc.get("title") if doc else None) or "Your task was updated",
            data={"route": "tasks", "taskId": task_id},
        )
    elif data.get("status") == "Completed":
        _notify_task_creator(task_id)
    return jsonify({"message": "Updated"})


@task_bp.route("/api/tasks/<task_id>", methods=["DELETE"])
@admin_required
def delete_task_route(task_id):
    delete_task(task_id)
    return jsonify({"message": "Deleted"})


@task_bp.route("/api/tasks/counts", methods=["GET"])
@admin_required
def counts():
    result = task_counts()
    return jsonify(result)


@task_bp.route("/api/tasks/person/<person_id>", methods=["GET"])
@auth_required
def person_tasks(person_id):
    person_type = request.args.get("type", "employee")
    tasks = tasks_for_person(person_id, person_type)
    return jsonify(tasks)


@task_bp.route("/api/tasks/<task_id>/comments", methods=["POST"])
@auth_required
def add_task_comment_route(task_id):
    data = request.get_json() or {}
    body = (data.get("body") or "").strip()
    author = (data.get("author") or "").strip()
    author_type = (data.get("author_type") or "employee").strip()

    if not body:
        return jsonify({"error": "Message body is required"}), 400
    if len(body) > COMMENT_MAX_LENGTH:
        return jsonify({"error": f"Message must be under {COMMENT_MAX_LENGTH} characters"}), 400
    if not author:
        return jsonify({"error": "author is required"}), 400
    if author_type not in COMMENT_AUTHOR_TYPES:
        return jsonify({"error": "author_type must be employee, intern, admin or support"}), 400

    comment = {
        "author": author,
        "author_type": author_type,
        "body": body,
        "created_at": datetime.utcnow(),
    }
    task = add_task_comment(task_id, comment)
    if task is None:
        return jsonify({"error": "Task not found"}), 404

    log_activity("Task Comment Added", f"{task.get('title', '')} by {author}")
    if author_type in {"admin", "support"}:
        preview = body if len(body) <= 120 else body[:117] + "..."
        _notify_assigned(
            task,
            "New message on your task",
            f"{author}: {preview}",
            data={"route": "tasks", "taskId": task_id},
        )
    return jsonify({"task": task}), 201


@task_bp.route("/api/tasks/upcoming", methods=["GET"])
@admin_required
def upcoming():
    limit = int(request.args.get("limit", 8))
    tasks = upcoming_tasks(limit)
    return jsonify(tasks)

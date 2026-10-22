import base64
import io
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, redirect
from backend.db import serialize_doc
from backend.models.support_model import (
    STATUS_ORDER,
    SUPPORT_TRANSITIONS,
    EMPLOYEE_CANCEL_FROM,
    EMPLOYEE_REOPEN_FROM,
    create_ticket,
    find_ticket,
    list_tickets,
    count_tickets,
    add_comment,
    append_activity,
    set_status,
    set_priority,
    build_attachment,
    find_ticket_by_attachment,
    get_serialized_ticket,
)
from backend.utils.activity_log import log_activity
from backend.utils.notify import notify_person
from backend.utils.auth import admin_required, auth_required
from backend.utils import storage

support_bp = Blueprint("support", __name__)

DEFAULT_CATEGORIES = [
    "IT / Technical",
    "HR & Payroll",
    "Facilities & Office",
    "Attendance & Leave",
    "General",
]

MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024


_HIDDEN_ATTACHMENT_FIELDS = ("file_data_base64", "cloudinary_public_id")


def _strip_file_data(value):
    if isinstance(value, dict):
        return {
            k: _strip_file_data(v)
            for k, v in value.items()
            if k not in _HIDDEN_ATTACHMENT_FIELDS
        }
    if isinstance(value, list):
        return [_strip_file_data(item) for item in value]
    return value


def _public_ticket(doc):
    if doc is None:
        return None
    return _strip_file_data(serialize_doc(doc))


def _resolve_person(person_id, person_type):
    if person_type == "intern":
        from backend.models.intern_model import get_intern_by_id

        person = get_intern_by_id(person_id)
    else:
        from backend.models.employee_model import get_employee

        person = get_employee(person_id)
    if not person:
        return None, ""
    label = person.get("name", "")
    id_label = person.get("employee_id") or person.get("intern_id") or ""
    return label, id_label


def _parse_attachments(file_list):
    attachments = []
    for file_storage in file_list:
        if not file_storage or not file_storage.filename:
            continue
        if file_storage.filename == "":
            continue
        if len(attachments) >= MAX_ATTACHMENTS:
            return None, f"Maximum of {MAX_ATTACHMENTS} attachments per message"
        if file_storage.content_length and file_storage.content_length > MAX_ATTACHMENT_BYTES:
            return None, f"Each attachment must be under {MAX_ATTACHMENT_BYTES // (1024 * 1024)}MB"
        try:
            attachment = build_attachment(file_storage)
        except storage.StorageError as exc:
            return None, f"Could not store attachment: {exc}"
        if attachment and attachment["file_size"] > MAX_ATTACHMENT_BYTES:
            return None, f"Each attachment must be under {MAX_ATTACHMENT_BYTES // (1024 * 1024)}MB"
        if attachment:
            attachments.append(attachment)
    return attachments, None


def _notify_ticket(doc, title, body):
    if not doc:
        return
    notify_person(
        doc.get("person_type", "employee"),
        doc.get("person_id"),
        title,
        body=body,
        route="support",
        category="Support",
        ref_id=doc.get("_id"),
        data={"route": "support", "supportId": str(doc.get("_id", ""))},
    )


def _activity_entry(action, author_type, author, details=""):
    return {
        "action": action,
        "author_type": author_type,
        "author": author,
        "details": details,
        "timestamp": datetime.utcnow(),
    }


def _support_categories():
    from backend.models.settings_model import get_settings

    raw = get_settings().get("support_categories", "")
    categories = [c.strip() for c in raw.split(",") if c.strip()]
    return categories or DEFAULT_CATEGORIES


@support_bp.route("/api/support/categories", methods=["GET"])
@auth_required
def get_categories():
    return jsonify(_support_categories())


@support_bp.route("/api/support/requests", methods=["GET"])
@auth_required
def list_requests():
    query = {}
    person_id = request.args.get("person_id", "").strip()
    person_type = request.args.get("person_type", "").strip()
    if person_id:
        query["person_id"] = person_id
        if person_type:
            query["person_type"] = person_type
    status = request.args.get("status", "").strip()
    if status:
        query["status"] = status
    category = request.args.get("category", "").strip()
    if category:
        query["category"] = category
    search = request.args.get("search", "").strip()
    if search:
        query["$or"] = [
            {"ticket_number": {"$regex": search, "$options": "i"}},
            {"subject": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"person_label": {"$regex": search, "$options": "i"}},
        ]
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
        skip = max(int(request.args.get("skip", 0)), 0)
    except ValueError:
        limit, skip = 50, 0

    docs = list_tickets(query, limit=limit, skip=skip)
    stats = {}
    for state in STATUS_ORDER:
        stats[state] = count_tickets({**query, "status": state})

    return jsonify({
        "requests": [_public_ticket(d) for d in docs],
        "total": count_tickets(query),
        "stats": stats,
    })


@support_bp.route("/api/support/requests", methods=["POST"])
@auth_required
def create_request():
    person_id = request.form.get("person_id", "").strip()
    person_type = request.form.get("person_type", "employee").strip() or "employee"
    category = request.form.get("category", "").strip()
    subject = request.form.get("subject", "").strip()
    description = request.form.get("description", "").strip()
    priority = request.form.get("priority", "medium").strip().lower()

    if not person_id:
        return jsonify({"error": "person_id is required"}), 400
    if not subject:
        return jsonify({"error": "Subject is required"}), 400
    if len(subject) > 200:
        return jsonify({"error": "Subject must be under 200 characters"}), 400
    if not description:
        return jsonify({"error": "Description is required"}), 400
    if len(description) > 10000:
        return jsonify({"error": "Description must be under 10000 characters"}), 400
    if category not in _support_categories():
        return jsonify({"error": "Invalid category"}), 400
    if priority not in {"low", "medium", "high"}:
        return jsonify({"error": "Priority must be low, medium or high"}), 400

    attachments, attachment_error = _parse_attachments(request.files.getlist("files"))
    if attachment_error:
        return jsonify({"error": attachment_error}), 400

    label, id_label = _resolve_person(person_id, person_type)
    if not label:
        return jsonify({"error": "Person not found"}), 400

    doc = create_ticket({
        "person_id": person_id,
        "person_type": person_type,
        "person_label": label,
        "id_label": id_label,
        "category": category,
        "subject": subject,
        "description": description,
        "priority": priority,
        "attachments": attachments,
    })

    log_activity("Support Ticket Created", f"{doc['ticket_number']} - {subject}")
    _notify_ticket(
        doc,
        f"Request {doc['ticket_number']} received",
        "We got your request and the team will respond shortly.",
    )
    return jsonify({"ticket": _public_ticket(doc)}), 201


@support_bp.route("/api/support/requests/<ticket_id>", methods=["GET"])
@auth_required
def get_request(ticket_id):
    doc = find_ticket(ticket_id)
    if not doc:
        return jsonify({"error": "Ticket not found"}), 404

    person_id = request.args.get("person_id", "").strip()
    if person_id and doc.get("person_id") != person_id:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(_public_ticket(doc))


@support_bp.route("/api/support/requests/<ticket_id>/responses", methods=["POST"])
@auth_required
def add_response(ticket_id):
    doc = find_ticket(ticket_id)
    if not doc:
        return jsonify({"error": "Ticket not found"}), 404

    author_type = request.form.get("author_type", "employee").strip()
    body = request.form.get("body", "").strip()
    author_name = request.form.get("author_name", "").strip()

    if author_type not in {"employee", "support"}:
        return jsonify({"error": "author_type must be employee or support"}), 400

    if author_type == "employee":
        person_id = request.form.get("person_id", "").strip()
        person_type = request.form.get("person_type", "employee").strip()
        if doc.get("person_id") != str(person_id):
            return jsonify({"error": "Forbidden"}), 403
        if doc.get("status") in {"cancelled", "closed"}:
            return jsonify({"error": "This ticket is closed"}), 400
        author_name = author_name or doc.get("person_label", "")

    if not body and not request.files.getlist("files"):
        return jsonify({"error": "Message body is required"}), 400
    if len(body) > 10000:
        return jsonify({"error": "Message must be under 10000 characters"}), 400

    attachments, attachment_error = _parse_attachments(request.files.getlist("files"))
    if attachment_error:
        return jsonify({"error": attachment_error}), 400

    comment = {
        "author_type": author_type,
        "author": author_name or (doc.get("person_label") if author_type == "employee" else "Support Team"),
        "body": body,
        "attachments": attachments,
        "created_at": datetime.utcnow(),
    }
    append_activity(
        ticket_id,
        _activity_entry(
            "response",
            author_type,
            comment["author"],
            f"{len(attachments)} attachment(s)" if attachments else body[:80],
        ),
    )
    updated = add_comment(ticket_id, comment)

    # Sensible auto-transitions so the timeline stays actionable.
    if author_type == "support" and updated.get("status") == "open":
        updated = set_status(
            ticket_id,
            "in_progress",
            _activity_entry("status_changed", "support", comment["author"], "open → in_progress"),
        )
        _notify_ticket(updated, f"{updated.get('ticket_number')} now in progress", updated.get("subject", ""))
    elif author_type == "employee" and updated.get("status") == "waiting":
        updated = set_status(
            ticket_id,
            "in_progress",
            _activity_entry("status_changed", "employee", comment["author"], "waiting → in_progress"),
        )
    elif author_type == "support":
        _notify_ticket(
            updated,
            f"Support replied on {updated.get('ticket_number')}",
            comment["body"][:80] or "New response with attachment(s)",
        )

    log_activity(
        "Support Response Added",
        f"{updated.get('ticket_number')} by {comment['author']}",
    )
    return jsonify({"ticket": _public_ticket(updated)}), 201


@support_bp.route("/api/support/requests/<ticket_id>/cancel", methods=["POST"])
@auth_required
def cancel_request(ticket_id):
    doc = find_ticket(ticket_id)
    if not doc:
        return jsonify({"error": "Ticket not found"}), 404
    person_id = (request.get_json() or {}).get("person_id", "").strip()
    if not person_id or doc.get("person_id") != str(person_id):
        return jsonify({"error": "Forbidden"}), 403
    if doc.get("status") not in EMPLOYEE_CANCEL_FROM:
        return jsonify({"error": "Ticket cannot be cancelled in its current state"}), 400

    updated = set_status(
        ticket_id,
        "cancelled",
        _activity_entry("status_changed", "employee", doc.get("person_label", ""), f"{doc.get('status')} → cancelled"),
    )
    log_activity("Support Ticket Cancelled", f"{doc.get('ticket_number')}")
    return jsonify({"ticket": _public_ticket(updated)})


@support_bp.route("/api/support/requests/<ticket_id>/reopen", methods=["POST"])
@auth_required
def reopen_request(ticket_id):
    doc = find_ticket(ticket_id)
    if not doc:
        return jsonify({"error": "Ticket not found"}), 404
    person_id = (request.get_json() or {}).get("person_id", "").strip()
    if not person_id or doc.get("person_id") != str(person_id):
        return jsonify({"error": "Forbidden"}), 403
    if doc.get("status") not in EMPLOYEE_REOPEN_FROM:
        return jsonify({"error": "Ticket cannot be reopened in its current state"}), 400

    updated = set_status(
        ticket_id,
        "open",
        _activity_entry("status_changed", "employee", doc.get("person_label", ""), f"{doc.get('status')} → open"),
    )
    log_activity("Support Ticket Reopened", f"{doc.get('ticket_number')}")
    return jsonify({"ticket": _public_ticket(updated)})


@support_bp.route("/api/support/requests/<ticket_id>/confirm-resolution", methods=["POST"])
@auth_required
def confirm_resolution(ticket_id):
    doc = find_ticket(ticket_id)
    if not doc:
        return jsonify({"error": "Ticket not found"}), 404
    person_id = (request.get_json() or {}).get("person_id", "").strip()
    if not person_id or doc.get("person_id") != str(person_id):
        return jsonify({"error": "Forbidden"}), 403
    if doc.get("status") != "resolved":
        return jsonify({"error": "Ticket must be resolved before confirming"}), 400

    updated = set_status(
        ticket_id,
        "closed",
        _activity_entry("status_changed", "employee", doc.get("person_label", ""), "resolved → closed"),
    )
    log_activity("Support Ticket Confirmed", f"{doc.get('ticket_number')}")
    return jsonify({"ticket": _public_ticket(updated)})


@support_bp.route("/api/support/requests/<ticket_id>/status", methods=["PUT"])
@admin_required
def update_status(ticket_id):
    doc = find_ticket(ticket_id)
    if not doc:
        return jsonify({"error": "Ticket not found"}), 404
    data = request.get_json() or {}
    new_status = data.get("status", "").strip()
    if new_status not in SUPPORT_TRANSITIONS:
        return jsonify({"error": "Invalid status"}), 400
    current = doc.get("status")
    if new_status not in SUPPORT_TRANSITIONS.get(current, set()):
        return jsonify({"error": f"Status cannot change from {current} to {new_status}"}), 400

    author = data.get("author", "Support Team").strip() or "Support Team"
    updated = set_status(
        ticket_id,
        new_status,
        _activity_entry("status_changed", "support", author, f"{current} → {new_status}"),
    )
    _notify_ticket(
        updated,
        f"{updated.get('ticket_number')} is now {new_status}",
        updated.get("subject", ""),
    )
    log_activity("Support Status Updated", f"{doc.get('ticket_number')} → {new_status}")
    return jsonify({"ticket": _public_ticket(updated)})


@support_bp.route("/api/support/requests/<ticket_id>/priority", methods=["PUT"])
@admin_required
def update_priority(ticket_id):
    doc = find_ticket(ticket_id)
    if not doc:
        return jsonify({"error": "Ticket not found"}), 404
    data = request.get_json() or {}
    new_priority = data.get("priority", "").strip().lower()
    if new_priority not in {"low", "medium", "high"}:
        return jsonify({"error": "Priority must be low, medium or high"}), 400

    author = data.get("author", "Support Team").strip() or "Support Team"
    updated = set_priority(
        ticket_id,
        new_priority,
        _activity_entry("priority_changed", "support", author, f"{doc.get('priority')} → {new_priority}"),
    )
    log_activity("Support Priority Updated", f"{doc.get('ticket_number')} → {new_priority}")
    return jsonify({"ticket": _public_ticket(updated)})


@support_bp.route("/api/support/attachments/<attachment_id>/download", methods=["GET"])
@auth_required
def download_attachment(attachment_id):
    from backend.db import serialize_doc as _serialize

    doc, _ = find_ticket_by_attachment(attachment_id)
    if not doc:
        return jsonify({"error": "Attachment not found"}), 404
    match = None
    for att in doc.get("attachments", []):
        if att.get("attachment_id") == attachment_id:
            match = att
            break
    if not match:
        for comment in doc.get("comments", []):
            for att in comment.get("attachments", []):
                if att.get("attachment_id") == attachment_id:
                    match = att
                    break
            if match:
                break
    if not match:
        return jsonify({"error": "Attachment not found"}), 404

    # Attachments live in the media backend; hand out the CDN URL.
    file_url = match.get("file_url")
    if file_url:
        return redirect(storage.download_url(file_url, match.get("file_name")), code=302)

    # Legacy attachments that still carry the file body inside MongoDB.
    if match.get("file_data_base64"):
        file_bytes = base64.b64decode(match["file_data_base64"])
        return send_file(
            io.BytesIO(file_bytes),
            as_attachment=True,
            download_name=match.get("file_name", "attachment"),
            mimetype=match.get("mime") or "application/octet-stream",
        )
    return jsonify({"error": "Attachment not found"}), 404
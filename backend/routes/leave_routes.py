"""Leave request endpoints.

People submit leave requests from the mobile app. Administrators list and
review them from the admin panel. Approval marks the days as ``Leave`` on the
person's attendance record.
"""
from flask import Blueprint, request, jsonify

from backend import config
from backend.models import leave_model
from backend.utils.auth import admin_required, auth_required, current_auth
from backend.utils.activity_log import log_activity
from backend.utils.notify import notify_person

leave_bp = Blueprint("leave", __name__)


@leave_bp.route("/api/leave", methods=["POST"])
@auth_required
def submit_leave():
    data = request.get_json(silent=True) or {}
    doc, error = leave_model.create_leave_request(
        person_type=data.get("person_type", "employee"),
        person_id=data.get("person_id", ""),
        leave_type=data.get("leave_type", ""),
        start_date=data.get("start_date", ""),
        end_date=data.get("end_date", ""),
        reason=data.get("reason", ""),
    )
    if error:
        return jsonify({"error": error}), 400

    log_activity(
        "Leave Request",
        f"{doc.get('person_type')} - {doc.get('leave_type')} from "
        f"{doc.get('start_date')} to {doc.get('end_date')}",
    )
    notify_person(
        doc.get("person_type", "employee"),
        doc.get("person_id"),
        "Leave request submitted",
        body=f"{doc.get('start_date')} to {doc.get('end_date')} \u00b7 awaiting approval",
        route="leave",
        category="Leave",
        ref_id=doc.get("_id"),
        dedupe_key=f"leave:{doc.get('_id')}:submitted",
    )
    return jsonify({
        "message": "Leave request submitted for approval",
        "leave_request": doc,
    }), 201


@leave_bp.route("/api/leave", methods=["GET"])
@auth_required
def get_leaves():
    auth = current_auth()
    person_id = request.args.get("person_id")
    person_type = request.args.get("person_type")

    if auth and auth.get("role") != "admin":
        person_id = auth.get("sub")
        person_type = auth.get("person_type")
    elif not auth and config.auth_required():
        return jsonify({"error": "Authentication required"}), 401

    filters = {
        "status": request.args.get("status"),
        "person_type": person_type,
        "person_id": person_id,
        "search": request.args.get("search"),
    }
    requests_list = leave_model.list_leave_requests(**filters)
    return jsonify({
        "requests": requests_list,
        "stats": leave_model.leave_stats(**filters),
        "total": len(requests_list),
    })


@leave_bp.route("/api/leave/stats", methods=["GET"])
@auth_required
def get_stats():
    auth = current_auth()
    person_id = request.args.get("person_id")
    person_type = request.args.get("person_type")
    if auth and auth.get("role") != "admin":
        person_id = auth.get("sub")
        person_type = auth.get("person_type")
    return jsonify(leave_model.leave_stats(
        person_type=person_type,
        person_id=person_id,
        search=request.args.get("search"),
    ))


@leave_bp.route("/api/leave/<leave_id>", methods=["GET"])
@auth_required
def get_leave(leave_id):
    doc = leave_model.get_leave_request(leave_id)
    if not doc:
        return jsonify({"error": "Leave request not found"}), 404
    return jsonify(doc)


@leave_bp.route("/api/leave/<leave_id>/approve", methods=["POST"])
@admin_required
def approve_leave(leave_id):
    data = request.get_json(silent=True) or {}
    auth = current_auth() or {}
    doc, error, code = leave_model.set_leave_status(
        leave_id,
        "approved",
        review_note=data.get("note", ""),
        reviewed_by=auth.get("name", "admin"),
    )
    if error:
        return jsonify({"error": error}), code
    log_activity(
        "Leave Approved",
        f"{doc.get('person_name') or doc.get('person_id')} - "
        f"{doc.get('start_date')} to {doc.get('end_date')}",
    )
    notify_person(
        doc.get("person_type", "employee"),
        doc.get("person_id"),
        f"Your {doc.get('leave_type', 'leave')} request was approved",
        body=f"{doc.get('start_date')} to {doc.get('end_date')}"
        + (f" · {doc.get('review_note')}" if doc.get("review_note") else ""),
        route="leave",
        category="Leave",
        ref_id=doc.get("_id"),
        dedupe_key=f"leave:{doc.get('_id')}:approved",
    )
    return jsonify({"message": "Leave approved", "leave_request": doc})


@leave_bp.route("/api/leave/<leave_id>/reject", methods=["POST"])
@admin_required
def reject_leave(leave_id):
    data = request.get_json(silent=True) or {}
    auth = current_auth() or {}
    doc, error, code = leave_model.set_leave_status(
        leave_id,
        "rejected",
        review_note=data.get("note", ""),
        reviewed_by=auth.get("name", "admin"),
    )
    if error:
        return jsonify({"error": error}), code
    log_activity(
        "Leave Rejected",
        f"{doc.get('person_name') or doc.get('person_id')} - "
        f"{doc.get('start_date')} to {doc.get('end_date')}",
    )
    notify_person(
        doc.get("person_type", "employee"),
        doc.get("person_id"),
        f"Your {doc.get('leave_type', 'leave')} request was rejected",
        body=f"{doc.get('start_date')} to {doc.get('end_date')}"
        + (f" · {doc.get('review_note')}" if doc.get("review_note") else ""),
        route="leave",
        category="Leave",
        ref_id=doc.get("_id"),
        dedupe_key=f"leave:{doc.get('_id')}:rejected",
    )
    return jsonify({"message": "Leave rejected", "leave_request": doc})

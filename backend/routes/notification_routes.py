"""Mobile notification inbox endpoints.

The signed-in person's token identifies them; admins (no person record) simply
receive an empty inbox.
"""
from flask import Blueprint, request, jsonify

from backend.models import notification_model
from backend.utils.activity_log import notification_feed
from backend.utils.auth import admin_required, auth_required, current_auth

notification_bp = Blueprint("notifications", __name__)


def _resolve_person():
    auth = current_auth() or {}
    person_type = auth.get("person_type") or request.args.get("person_type") or "employee"
    person_id = auth.get("sub") or request.args.get("person_id")
    return str(person_type).lower(), person_id


@notification_bp.route("/api/notifications/activity", methods=["GET"])
@admin_required
def admin_activity_feed():
    """Recent office activity for the admin notification bell and menu badges."""
    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 200))
    except (TypeError, ValueError):
        limit = 100
    return jsonify(notification_feed(limit))


@notification_bp.route("/api/notifications", methods=["GET"])
@auth_required
def list_notifications():
    person_type, person_id = _resolve_person()
    if not person_id:
        return jsonify({"notifications": [], "unread": 0})
    return jsonify({
        "notifications": notification_model.list_notifications(person_type, person_id),
        "unread": notification_model.unread_count(person_type, person_id),
    })


@notification_bp.route("/api/notifications/<notification_id>/read", methods=["POST"])
@auth_required
def mark_read(notification_id):
    person_type, person_id = _resolve_person()
    updated = notification_model.mark_read(notification_id, person_type, person_id)
    return jsonify({"message": "Read", "updated": updated})


@notification_bp.route("/api/notifications/read-all", methods=["POST"])
@auth_required
def mark_all_read():
    person_type, person_id = _resolve_person()
    if not person_id:
        return jsonify({"message": "No person", "updated": 0})
    updated = notification_model.mark_all_read(person_type, person_id)
    return jsonify({"message": "All read", "updated": updated})


@notification_bp.route("/api/notifications/<notification_id>", methods=["DELETE"])
@auth_required
def delete_notification(notification_id):
    person_type, person_id = _resolve_person()
    deleted = notification_model.delete_notification(notification_id, person_type, person_id)
    if not deleted:
        return jsonify({"error": "Notification not found"}), 404
    return jsonify({"message": "Deleted", "deleted": True})

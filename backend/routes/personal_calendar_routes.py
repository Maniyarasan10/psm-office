from flask import Blueprint, request, jsonify
from backend.models.personal_calendar_model import (
    add_personal_item,
    list_personal_items,
    update_personal_item,
    delete_personal_item,
)
from backend.utils.auth import auth_required, current_auth

personal_calendar_bp = Blueprint("personal_calendar", __name__)


def _person():
    auth = current_auth()
    if not auth:
        return None, None
    return auth.get("sub"), auth.get("person_type") or "employee"


@personal_calendar_bp.route("/api/personal-calendar", methods=["GET"])
@auth_required
def list_personal_calendar():
    person_id, person_type = _person()
    if not person_id:
        return jsonify({"error": "Authentication required"}), 401
    return jsonify(list_personal_items(person_id, person_type))


@personal_calendar_bp.route("/api/personal-calendar", methods=["POST"])
@auth_required
def create_personal_calendar():
    person_id, person_type = _person()
    if not person_id:
        return jsonify({"error": "Authentication required"}), 401
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    notes = (data.get("notes") or "").strip()
    date = (data.get("date") or "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400
    if not date:
        return jsonify({"error": "Date is required"}), 400
    saved = add_personal_item(person_id, person_type, title, notes, date)
    if not saved:
        return jsonify({"error": "Storage unavailable"}), 503
    return jsonify(saved), 201


@personal_calendar_bp.route("/api/personal-calendar/<item_id>", methods=["PUT"])
@auth_required
def update_personal_calendar(item_id):
    person_id, person_type = _person()
    if not person_id:
        return jsonify({"error": "Authentication required"}), 401
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    notes = (data.get("notes") or "").strip()
    date = (data.get("date") or "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400
    if not date:
        return jsonify({"error": "Date is required"}), 400
    ok = update_personal_item(item_id, person_id, person_type, title, notes, date)
    if not ok:
        return jsonify({"error": "Item not found or not yours"}), 404
    return jsonify({"message": "Updated"})


@personal_calendar_bp.route("/api/personal-calendar/<item_id>", methods=["DELETE"])
@auth_required
def delete_personal_calendar(item_id):
    person_id, person_type = _person()
    if not person_id:
        return jsonify({"error": "Authentication required"}), 401
    ok = delete_personal_item(item_id, person_id, person_type)
    if not ok:
        return jsonify({"error": "Item not found or not yours"}), 404
    return jsonify({"message": "Deleted"})

from flask import Blueprint, request, jsonify
from backend.models.intern_model import (
    all_interns, add_intern, update_intern,
    delete_intern, count_interns, set_intern_password, get_intern_by_id,
)
from backend.utils.activity_log import log_activity
from backend.utils.photo_utils import delete_profile_file, normalize_photo_path
from backend.utils.auth import admin_required, auth_required, current_auth
from backend.utils.authz import can_access_person, is_admin
from backend.utils.ids import next_intern_id, peek_intern_id
from backend.utils.passwords import generate_temp_password
from backend.utils.mailer import send_credentials_email

intern_bp = Blueprint("interns", __name__)


@intern_bp.route("/api/interns", methods=["GET"])
@auth_required
def list_interns():
    search = request.args.get("search")
    interns = all_interns(search)
    return jsonify(interns)


@intern_bp.route("/api/interns/next-id", methods=["GET"])
@admin_required
def next_intern_id_route():
    return jsonify({"next_id": peek_intern_id()})


@intern_bp.route("/api/interns", methods=["POST"])
@admin_required
def create_intern():
    data = request.get_json() or {}
    if not (data.get("intern_id") or "").strip():
        data["intern_id"] = next_intern_id()
    intern_id_value = data["intern_id"]

    password = data.pop("password", None)
    generated_password = None
    if not password:
        password = generated_password = generate_temp_password()
    data["photo_path"] = normalize_photo_path(data.get("photo_path"))

    intern_id = add_intern(data)
    set_intern_password(intern_id_value, password)
    log_activity(
        "Intern Created",
        f"{data.get('name') or intern_id_value} ({intern_id_value})",
    )

    email = (data.get("email") or "").strip()
    email_sent, email_reason = False, ""
    if email:
        email_sent, email_reason = send_credentials_email(
            email, data.get("name"), intern_id_value, password, "intern"
        )

    payload = {
        "_id": intern_id,
        "intern_id": intern_id_value,
        "email_sent": email_sent,
        "email_reason": email_reason,
    }
    if generated_password:
        payload["generated_password"] = generated_password
    return jsonify(payload), 201


@intern_bp.route("/api/interns/<intern_id>", methods=["PUT"])
@auth_required
def update_int(intern_id):
    data = request.get_json(silent=True) or {}
    existing = get_intern_by_id(intern_id)
    auth = current_auth()
    password = data.get("password")
    if auth and not is_admin(auth):
        if not existing or not can_access_person(
            auth, existing.get("_id"), existing.get("intern_id"), intern_id
        ):
            return jsonify({"error": "Forbidden"}), 403
        allowed = {"name", "phone", "email", "photo_path"}
        data = {key: value for key, value in data.items() if key in allowed}
        # A person may never set a password through the profile endpoint;
        # password changes go through the OTP/change-password flows.
        password = None

    data.pop("_id", None)
    data.pop("password_hash", None)
    data.pop("password", None)
    new_photo = normalize_photo_path(data.get("photo_path"))
    if new_photo is not None:
        data["photo_path"] = new_photo
    update_intern(intern_id, data)
    log_activity(
        "Intern Updated",
        f"{(existing or {}).get('name') or data.get('name') or intern_id}",
    )
    if password:
        intern = all_interns()
        target = next((i for i in intern if i["_id"] == intern_id), None)
        if target:
            set_intern_password(target.get("intern_id", ""), password)
    if existing:
        old_photo = existing.get("photo_path")
        if old_photo and old_photo != data.get("photo_path"):
            delete_profile_file(old_photo)
    return jsonify({"message": "Updated"})


@intern_bp.route("/api/interns/<intern_id>", methods=["DELETE"])
@admin_required
def delete_int(intern_id):
    existing = get_intern_by_id(intern_id)
    delete_intern(intern_id)
    log_activity(
        "Intern Deleted",
        f"{(existing or {}).get('name') or intern_id}",
    )
    if existing:
        delete_profile_file(existing.get("photo_path"))
    return jsonify({"message": "Deleted"})


@intern_bp.route("/api/interns/count", methods=["GET"])
@admin_required
def count_int():
    total = count_interns()
    return jsonify({"total": total})

from flask import Blueprint, request, jsonify
from bson import ObjectId
from backend.models.employee_model import (
    all_employees, get_employee, add_employee, update_employee,
    delete_employee, count_employees, count_active_employees, upcoming_birthdays,
)
from backend.models.auth_model import set_password
from backend.utils.photo_utils import delete_profile_file, normalize_photo_path
from backend.utils.auth import admin_required, auth_required
from backend.utils.ids import next_employee_id, peek_employee_id
from backend.utils.passwords import generate_temp_password
from backend.utils.mailer import send_credentials_email

employee_bp = Blueprint("employees", __name__)


@employee_bp.route("/api/employees", methods=["GET"])
@auth_required
def list_employees():
    search = request.args.get("search")
    employees = all_employees(search)
    return jsonify(employees)


@employee_bp.route("/api/employees/next-id", methods=["GET"])
@admin_required
def next_employee_id_route():
    return jsonify({"next_id": peek_employee_id()})


@employee_bp.route("/api/employees/<employee_id>", methods=["GET"])
@auth_required
def get_emp(employee_id):
    emp = get_employee(employee_id)
    if emp:
        return jsonify(emp)
    return jsonify({"error": "Not found"}), 404


@employee_bp.route("/api/employees", methods=["POST"])
@admin_required
def create_employee():
    data = request.get_json() or {}
    if not (data.get("employee_id") or "").strip():
        data["employee_id"] = next_employee_id()
    employee_id_value = data["employee_id"]

    password = data.pop("password", None)
    generated_password = None
    if not password:
        password = generated_password = generate_temp_password()
    data["photo_path"] = normalize_photo_path(data.get("photo_path"))

    employee_id = add_employee(data)
    set_password(employee_id_value, password)

    email = (data.get("email") or "").strip()
    email_sent, email_reason = False, ""
    if email:
        email_sent, email_reason = send_credentials_email(
            email, data.get("name"), employee_id_value, password, "employee"
        )

    payload = {
        "_id": employee_id,
        "employee_id": employee_id_value,
        "email_sent": email_sent,
        "email_reason": email_reason,
    }
    if generated_password:
        payload["generated_password"] = generated_password
    return jsonify(payload), 201


@employee_bp.route("/api/employees/<employee_id>", methods=["PUT"])
@auth_required
def update_emp(employee_id):
    data = request.get_json()
    data.pop("_id", None)
    data.pop("password", None)
    data.pop("password_hash", None)
    existing = get_employee(employee_id)
    new_photo = normalize_photo_path(data.get("photo_path"))
    if new_photo is not None:
        data["photo_path"] = new_photo
    update_employee(employee_id, data)
    if existing:
        old_photo = existing.get("photo_path")
        if old_photo and old_photo != data.get("photo_path"):
            delete_profile_file(old_photo)
    return jsonify({"message": "Updated"})


@employee_bp.route("/api/employees/<employee_id>", methods=["DELETE"])
@admin_required
def delete_emp(employee_id):
    existing = get_employee(employee_id)
    delete_employee(employee_id)
    if existing:
        delete_profile_file(existing.get("photo_path"))
    return jsonify({"message": "Deleted"})


@employee_bp.route("/api/employees/count", methods=["GET"])
@admin_required
def count_emp():
    total = count_employees()
    active = count_active_employees()
    return jsonify({"total": total, "active": active})


@employee_bp.route("/api/employees/birthdays", methods=["GET"])
@auth_required
def birthdays():
    days = int(request.args.get("days", 30))
    result = upcoming_birthdays(days)
    return jsonify(result)

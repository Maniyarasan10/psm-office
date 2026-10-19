import hmac
import os
from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash
from backend.models.auth_model import verify_password, set_password, get_employee_by_id
from backend.models.intern_model import verify_intern_password, set_intern_password, get_intern_by_id
from backend.models.password_reset_model import (
    find_person, generate_otp, create_otp, verify_otp,
)
from backend.utils.mailer import send_password_otp_email
from backend.utils.auth import issue_token, verify_token, admin_required, auth_required, current_auth
from backend.utils.ratelimit import rate_limit
from backend import config

auth_bp = Blueprint("auth", __name__)


def _password_policy_error(password):
    """Return an error string when ``password`` fails the policy, else None."""
    minimum = config.min_password_length()
    if not isinstance(password, str) or len(password) < minimum:
        return f"Password must be at least {minimum} characters"
    return None


def _person_tokens(person, person_type, display_name):
    """One access token (short TTL) plus a long-lived refresh token."""
    access = issue_token(
        person,
        "user",
        person_type=person_type,
        display_name=display_name,
    )
    refresh = issue_token(
        person,
        "user",
        person_type=person_type,
        display_name=display_name,
        ttl=config.refresh_token_ttl(),
        extra={"token_type": "refresh"},
    )
    return access, refresh


@auth_bp.route("/api/auth/admin-login", methods=["POST"])
@rate_limit(10, 300, scope="admin-login")
def admin_login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "")
    admin_hash = (os.getenv("ADMIN_PASSWORD_HASH", "") or "").strip()

    # Fail closed: never treat an unset/empty admin password as valid.
    if not admin_pass and not admin_hash:
        return jsonify({"error": "Admin login is not configured on this server"}), 503

    # Constant-time comparison to avoid leaking credentials via timing.
    user_ok = hmac.compare_digest(username.encode("utf-8"), admin_user.encode("utf-8"))
    if admin_hash:
        pass_ok = check_password_hash(admin_hash, password)
    else:
        pass_ok = hmac.compare_digest(password.encode("utf-8"), admin_pass.encode("utf-8"))

    if not (user_ok and pass_ok):
        return jsonify({"error": "Invalid admin credentials"}), 401

    token = issue_token("admin", "admin", display_name=admin_user)
    return jsonify({
        "_id": "admin",
        "username": admin_user,
        "name": "Administrator",
        "role": "admin",
        "photo_path": os.getenv("ADMIN_PHOTO_PATH", "/fin.png"),
        "token": token,
    })


@auth_bp.route("/api/auth/login", methods=["POST"])
@rate_limit(10, 300, scope="login")
def login():
    data = request.get_json() or {}
    employee_id = (data.get("employee_id") or "").strip()
    password = data.get("password") or ""

    if not employee_id or not password:
        return jsonify({"error": "Employee ID and password are required"}), 400

    employee = verify_password(employee_id, password)
    if employee:
        access_token, refresh_token = _person_tokens(
            employee.get("_id"), "employee", employee.get("name")
        )
        safe_employee = {
            "_id": employee.get("_id"),
            "employee_id": employee.get("employee_id"),
            "name": employee.get("name"),
            "department": employee.get("department"),
            "designation": employee.get("designation"),
            "phone": employee.get("phone"),
            "email": employee.get("email"),
            "status": employee.get("status"),
            "photo_path": employee.get("photo_path"),
            "person_type": "employee",
            "token": access_token,
            "refresh_token": refresh_token,
        }
        return jsonify(safe_employee)

    intern = verify_intern_password(employee_id, password)
    if intern:
        access_token, refresh_token = _person_tokens(
            intern.get("_id"), "intern", intern.get("name")
        )
        safe_intern = {
            "_id": intern.get("_id"),
            "employee_id": intern.get("intern_id"),
            "name": intern.get("name"),
            "department": intern.get("department"),
            "college": intern.get("college"),
            "photo_path": intern.get("photo_path"),
            "person_type": "intern",
            "token": access_token,
            "refresh_token": refresh_token,
        }
        return jsonify(safe_intern)

    return jsonify({"error": "Invalid ID or password"}), 401


@auth_bp.route("/api/auth/refresh-token", methods=["POST"])
@rate_limit(30, 300, scope="refresh-token")
def refresh_token():
    """Exchange a valid refresh token for a fresh access token pair.

    Refresh tokens are only minted at login and can't reach data endpoints;
    they expire after ``AUTH_REFRESH_TOKEN_TTL`` (90 days by default) and are
    renewed on every successful exchange, so an active user is never forced to
    log in again after the short-lived access token expires.
    """
    data = request.get_json() or {}
    token = (data.get("refresh_token") or "").strip()
    payload = verify_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired refresh token"}), 401
    if payload.get("token_type") != "refresh":
        return jsonify({"error": "Invalid refresh token"}), 401
    if not payload.get("sub"):
        return jsonify({"error": "Invalid refresh token"}), 401

    role = payload.get("role", "user")
    person_type = payload.get("person_type")
    display_name = payload.get("name")
    access, refresh = _person_tokens(payload["sub"], person_type, display_name)
    response = {"token": access, "refresh_token": refresh, "role": role}
    if person_type:
        response["person_type"] = person_type
    return jsonify(response)


@auth_bp.route("/api/auth/change-password", methods=["POST"])
@rate_limit(10, 300, scope="change-password")
def change_password():
    data = request.get_json() or {}
    user_id = (data.get("employee_id") or "").strip()
    person_type = data.get("person_type", "employee")
    old_password = data.get("old_password", "")
    new_password = data.get("new_password", "")

    if not user_id or not old_password or not new_password:
        return jsonify({"error": "All fields are required"}), 400

    policy_error = _password_policy_error(new_password)
    if policy_error:
        return jsonify({"error": policy_error}), 400

    if person_type == "intern":
        intern = verify_intern_password(user_id, old_password)
        if not intern:
            return jsonify({"error": "Current password is incorrect"}), 401
        set_intern_password(user_id, new_password)
    else:
        employee = verify_password(user_id, old_password)
        if not employee:
            return jsonify({"error": "Current password is incorrect"}), 401
        set_password(user_id, new_password)

    return jsonify({"message": "Password changed successfully"})


@auth_bp.route("/api/auth/set-password", methods=["POST"])
@admin_required
def admin_set_password():
    data = request.get_json() or {}
    user_id = (data.get("employee_id") or "").strip()
    person_type = data.get("person_type", "employee")
    new_password = data.get("new_password", "")

    if not user_id or not new_password:
        return jsonify({"error": "ID and new password are required"}), 400

    policy_error = _password_policy_error(new_password)
    if policy_error:
        return jsonify({"error": policy_error}), 400

    if person_type == "intern":
        intern = get_intern_by_id(user_id)
        if not intern:
            return jsonify({"error": "Intern not found"}), 404
        set_intern_password(user_id, new_password)
    else:
        emp = get_employee_by_id(user_id)
        if not emp:
            return jsonify({"error": "Employee not found"}), 404
        set_password(user_id, new_password)

    return jsonify({"message": "Password set successfully"})


@auth_bp.route("/api/auth/forgot-password/request", methods=["POST"])
@rate_limit(5, 900, scope="forgot-password-request")
def forgot_password_request():
    """Email a one-time reset code to the person's registered address.

    Always returns a generic success so the endpoint can't be used to discover
    which IDs exist.
    """
    data = request.get_json() or {}
    identifier = (data.get("identifier") or "").strip()
    generic = {
        "message": "If that ID exists, a reset code has been sent to its registered email."
    }
    if not identifier:
        return jsonify({"error": "Enter your employee or intern ID"}), 400

    person = find_person(identifier)
    if person and person.get("email"):
        otp = generate_otp()
        create_otp(identifier, person["person_type"], otp)
        send_password_otp_email(
            person["email"], person.get("name"), otp, person["person_type"]
        )
    return jsonify(generic)


@auth_bp.route("/api/auth/forgot-password/reset", methods=["POST"])
@rate_limit(10, 900, scope="forgot-password-reset")
def forgot_password_reset():
    """Set a new password after verifying the emailed one-time code."""
    data = request.get_json() or {}
    identifier = (data.get("identifier") or "").strip()
    otp = (data.get("otp") or "").strip()
    new_password = data.get("new_password") or ""

    if not identifier or not otp or not new_password:
        return jsonify({"error": "ID, code and new password are required"}), 400
    policy_error = _password_policy_error(new_password)
    if policy_error:
        return jsonify({"error": policy_error}), 400

    record = verify_otp(identifier, otp)
    if not record:
        return jsonify({"error": "Invalid or expired code"}), 400

    if record.get("person_type") == "intern":
        set_intern_password(identifier, new_password)
    else:
        set_password(identifier, new_password)
    return jsonify({"message": "Password reset successfully. You can sign in now."})


@auth_bp.route("/api/auth/send-reset-otp", methods=["POST"])
@admin_required
@rate_limit(20, 600, scope="admin-send-reset-otp")
def admin_send_reset_otp():
    """Admin-triggered reset code email, with an explicit result."""
    data = request.get_json() or {}
    identifier = (data.get("identifier") or "").strip()
    if not identifier:
        return jsonify({"error": "Employee or intern ID is required"}), 400

    person = find_person(identifier)
    if not person:
        return jsonify({"error": "No employee or intern was found with that ID"}), 404
    if not person.get("email"):
        return jsonify({"error": f"{person.get('name') or identifier} has no email on record"}), 400

    otp = generate_otp()
    create_otp(identifier, person["person_type"], otp)
    sent, reason = send_password_otp_email(
        person["email"], person.get("name"), otp, person["person_type"]
    )
    if not sent:
        return jsonify({"error": reason}), 502
    return jsonify({"message": f"Reset code sent to {person['email']}", "email": person["email"]})


@auth_bp.route("/api/update-push-token", methods=["POST"])
@auth_required
def update_push_token():
    data = request.get_json() or {}
    push_token = data.get("pushToken")

    if not push_token or not isinstance(push_token, str) or len(push_token) > 512:
        return jsonify({"error": "A valid push token is required"}), 400

    auth = current_auth() or {}
    if auth.get("role") == "admin":
        person_id = data.get("employeeId")
        person_type = data.get("personType", "employee")
    else:
        # A person may only register a token against their own record.
        person_id = auth.get("sub")
        person_type = auth.get("person_type") or "employee"

    if not person_id:
        return jsonify({"error": "Authentication required"}), 401

    from backend.db import get_db
    from bson import ObjectId
    from datetime import datetime

    # Persist the Expo push token so the support system can notify the
    # requester when a ticket is updated. Stored on the person record.
    db = get_db()
    if db is None:
        return jsonify({"error": "Storage unavailable"}), 503
    collection = db.interns if person_type == "intern" else db.employees
    key_field = "intern_id" if person_type == "intern" else "employee_id"
    try:
        oid = ObjectId(str(person_id))
    except Exception:
        oid = None
    match = {"_id": oid} if oid else {key_field: person_id}
    collection.update_one(
        match,
        {"$set": {"push_token": push_token, "push_token_updated_at": datetime.utcnow()}},
    )

    return jsonify({"status": "token received"}), 200

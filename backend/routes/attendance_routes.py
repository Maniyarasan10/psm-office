from flask import Blueprint, request, jsonify
from backend.models.attendance_model import (
    for_date, mark, clock_in, clock_out, set_status,
    today_summary, monthly_report, report_between, for_person,
    person_summary, auto_mark_absent, auto_mark_absent_range,
    auto_mark_absent_for_person,
)
from backend.models.employee_model import all_employees
from backend.models.intern_model import all_interns
from backend.utils.activity_log import log_activity
from backend.utils.photo_utils import store_photo
from backend.utils.uploads import validate_image_upload
from backend.utils.auth import admin_required, auth_required, current_auth
from backend.realtime import notify_event
from backend.db import get_db
from datetime import date as date_type
from bson import ObjectId

attendance_bp = Blueprint("attendance", __name__)


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def _backfill_person(person_id):
    db = get_db()
    if db.employees.find_one({"_id": _to_oid(person_id)}):
        return auto_mark_absent_for_person("employee", person_id)
    if db.interns.find_one({"_id": _to_oid(person_id)}):
        return auto_mark_absent_for_person("intern", person_id)
    return {"marked": 0}


def _build_roster(target_date):
    auto_mark_absent(target_date)
    employees = all_employees()
    interns = all_interns()
    existing = for_date(target_date)
    existing_map = {
        (a["person_type"], a["person_id"]): a for a in existing
    }

    roster = []
    for emp in employees:
        if emp.get("status") != "Active":
            continue
        key = ("employee", emp["_id"])
        att = existing_map.get(key, {})
        roster.append({
            "person_type": "employee",
            "person_id": emp["_id"],
            "name": emp.get("name", ""),
            "employee_id": emp.get("employee_id", ""),
            "clock_in": att.get("clock_in"),
            "clock_out": att.get("clock_out"),
            "working_hours": att.get("working_hours"),
            "status": att.get("status", "Absent"),
            "notes": att.get("notes", ""),
            "photo_path": att.get("photo_path"),
            "profile_photo_path": emp.get("photo_path", ""),
            "latitude": att.get("latitude"),
            "longitude": att.get("longitude"),
        })

    for intern in interns:
        key = ("intern", intern["_id"])
        att = existing_map.get(key, {})
        roster.append({
            "person_type": "intern",
            "person_id": intern["_id"],
            "name": intern.get("name", ""),
            "employee_id": intern.get("intern_id", ""),
            "clock_in": att.get("clock_in"),
            "clock_out": att.get("clock_out"),
            "working_hours": att.get("working_hours"),
            "status": att.get("status", "Absent"),
            "notes": att.get("notes", ""),
            "photo_path": att.get("photo_path"),
            "profile_photo_path": intern.get("photo_path", ""),
            "latitude": att.get("latitude"),
            "longitude": att.get("longitude"),
        })

    return roster


@attendance_bp.route("/api/attendance", methods=["GET"])
@auth_required
def get_attendance():
    target_date = request.args.get("date", date_type.today().isoformat())
    roster = _build_roster(target_date)
    summary = today_summary(target_date)
    return jsonify({"roster": roster, "summary": summary})


@attendance_bp.route("/api/attendance/person/<person_id>", methods=["GET"])
@auth_required
def get_person_attendance(person_id):
    limit = int(request.args.get("limit", 30))
    _backfill_person(person_id)
    records = for_person(person_id, limit)
    return jsonify(records)


@attendance_bp.route("/api/attendance/person/<person_id>/summary", methods=["GET"])
@auth_required
def get_person_summary(person_id):
    _backfill_person(person_id)
    summary = person_summary(person_id)
    return jsonify(summary)


@attendance_bp.route("/api/attendance/confirm", methods=["POST"])
@auth_required
def confirm_attendance():
    person_id = request.form.get("person_id")
    person_type = request.form.get("person_type", "employee")
    latitude = request.form.get("latitude")
    longitude = request.form.get("longitude")
    time_str = request.form.get("time")
    target_date = request.form.get("date", date_type.today().isoformat())

    if not person_id:
        return jsonify({"error": "person_id is required"}), 400

    # A non-admin may only confirm attendance for their own record.
    auth = current_auth()
    if auth and auth.get("role") != "admin" and str(auth.get("sub")) != str(person_id):
        return jsonify({"error": "Forbidden"}), 403

    photo_path = None
    if "photo" in request.files:
        photo_file = request.files["photo"]
        if photo_file and photo_file.filename:
            raw_bytes, mime, error = validate_image_upload(photo_file)
            if error:
                return jsonify({"error": error}), 400
            photo_path = store_photo(raw_bytes, mime)
            if not photo_path:
                return jsonify({"error": "Storage unavailable"}), 500

    try:
        lat = float(latitude) if latitude else None
        lng = float(longitude) if longitude else None
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid coordinates"}), 400

    clock_in(
        person_type=person_type,
        person_id=person_id,
        target_date=target_date,
        time_str=time_str,
        photo_path=photo_path,
        latitude=lat,
        longitude=lng,
    )

    log_activity("Mobile Clock In", f"{person_type} at {time_str} with geotag")

    notify_event(person_id, "attendance")

    return jsonify({
        "message": "Attendance confirmed",
        "photo_path": photo_path,
        "latitude": lat,
        "longitude": lng,
    })


@attendance_bp.route("/api/attendance/mark", methods=["POST"])
@admin_required
def mark_attendance():
    data = request.get_json()
    mark(
        person_type=data["person_type"],
        person_id=data["person_id"],
        target_date=data.get("date", date_type.today().isoformat()),
        status=data.get("status", "Present"),
        clock_in=data.get("clock_in"),
        clock_out=data.get("clock_out"),
        notes=data.get("notes", ""),
    )
    log_activity("Attendance Marked", f"{data['person_type']} - {data.get('status', 'Present')}")
    notify_event(data.get("person_id"), "attendance")
    return jsonify({"message": "Marked"})


@attendance_bp.route("/api/attendance/clock-in", methods=["POST"])
@auth_required
def clock_in_route():
    data = request.get_json()
    clock_in(
        person_type=data["person_type"],
        person_id=data["person_id"],
        target_date=data.get("date", date_type.today().isoformat()),
        time_str=data["time"],
    )
    log_activity("Clock In", f"{data['person_type']} at {data['time']}")
    notify_event(data.get("person_id"), "attendance")
    return jsonify({"message": "Clocked in"})


@attendance_bp.route("/api/attendance/clock-out", methods=["POST"])
@auth_required
def clock_out_route():
    data = request.get_json()
    clock_out(
        person_type=data["person_type"],
        person_id=data["person_id"],
        target_date=data.get("date", date_type.today().isoformat()),
        time_str=data["time"],
    )
    log_activity("Clock Out", f"{data['person_type']} at {data['time']}")
    notify_event(data.get("person_id"), "attendance")
    return jsonify({"message": "Clocked out"})


@attendance_bp.route("/api/attendance/status", methods=["POST"])
@admin_required
def set_attendance_status():
    data = request.get_json()
    set_status(
        person_type=data["person_type"],
        person_id=data["person_id"],
        target_date=data.get("date", date_type.today().isoformat()),
        status=data["status"],
    )
    notify_event(data.get("person_id"), "attendance")
    return jsonify({"message": "Status updated"})


@attendance_bp.route("/api/attendance/leave", methods=["POST"])
@auth_required
def leave_request():
    """Legacy submit endpoint. Creates a pending leave request (approval is
    handled in the admin panel); kept for older mobile builds."""
    from backend.models.leave_model import create_leave_request

    data = request.get_json(silent=True) or {}
    doc, error = create_leave_request(
        person_type=data.get("person_type", "employee"),
        person_id=data.get("person_id", ""),
        leave_type=data.get("leave_type", ""),
        start_date=data.get("start_date", ""),
        end_date=data.get("end_date", ""),
        reason=data.get("reason", ""),
    )
    if error:
        return jsonify({"error": error}), 400

    from backend.utils.activity_log import log_activity
    log_activity(
        "Leave Request",
        f"{doc.get('person_type')} - {doc.get('leave_type')} from "
        f"{doc.get('start_date')} to {doc.get('end_date')}",
    )

    return jsonify({
        "message": "Leave request submitted for approval",
        "marked": 0,
        "leave_request": doc,
    }), 201

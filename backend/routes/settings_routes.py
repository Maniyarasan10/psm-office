from flask import Blueprint, request, jsonify
from backend.models.settings_model import (
    get_settings,
    update_settings,
    get_announcement_senders,
    set_announcement_senders,
)
from backend.utils.activity_log import log_activity, recent_activity
from backend.models.note_model import get_note, save_note
from backend.models.announcement_model import add_announcement, list_announcements
from backend.models.employee_model import count_active_employees, upcoming_birthdays
from backend.models.intern_model import count_interns
from backend.models.task_model import task_counts, upcoming_tasks
from backend.models.attendance_model import (
    today_summary, for_date, report_between, auto_mark_absent, auto_mark_absent_range,
)
from backend.db import get_db
from backend.utils.push_utils import send_push
from backend.models import notification_model
from backend.utils.auth import (
    admin_required,
    announcement_sender_required,
    can_send_announcement,
    current_auth,
)
from datetime import date as date_type

settings_bp = Blueprint("settings", __name__)


def _broadcast_announcement(content):
    """Persist an inbox entry for everyone and push to every registered device."""
    if not content:
        return
    db = get_db()
    tokens = []
    recipients = []
    for collection, ptype in ((db.employees, "employee"), (db.interns, "intern")):
        for doc in collection.find({}, {"push_token": 1}):
            recipients.append((ptype, str(doc.get("_id"))))
            token = doc.get("push_token")
            if isinstance(token, str) and token:
                tokens.append(token)
    body = content if len(content) <= 200 else content[:197] + "..."
    if recipients:
        notification_model.add_bulk_notifications(
            recipients, "New announcement", body,
            route="announcements", category="Announcement",
        )
    if not tokens:
        return
    send_push(tokens, "New announcement", body, data={"route": "announcements"})


@settings_bp.route("/api/settings", methods=["GET"])
def get_settings_route():
    settings = get_settings()
    return jsonify(settings)


@settings_bp.route("/api/settings", methods=["POST"])
@admin_required
def update_settings_route():
    data = request.get_json()
    update_settings(data)
    try:
        from backend.realtime import notify_all
        notify_all("settings", **{"settings": get_settings()})
    except Exception:
        pass
    log_activity("Settings Updated", str(list(data.keys())))
    return jsonify({"message": "Settings updated"})


@settings_bp.route("/api/notes", methods=["GET"])
@admin_required
def get_notes():
    note = get_note()
    return jsonify(note)


@settings_bp.route("/api/notes", methods=["POST"])
@admin_required
def save_notes():
    data = request.get_json()
    save_note(data.get("content", ""))
    return jsonify({"message": "Saved"})


@settings_bp.route("/api/dashboard", methods=["GET"])
@admin_required
def get_dashboard():
    today = date_type.today().isoformat()
    auto_mark_absent(today)
    active_employees = count_active_employees()
    total_interns = count_interns()
    task_counts_data = task_counts()
    attendance = today_summary(today)
    birthdays = upcoming_birthdays(30)
    tasks = upcoming_tasks(8)
    activity = recent_activity(8)
    note = get_note()

    from backend.db import serialize_doc

    return jsonify({
        "total_employees": active_employees,
        "total_interns": total_interns,
        "present_today": attendance.get("present", 0),
        "absent_today": attendance.get("absent", 0),
        "remote_workers": attendance.get("remote", 0),
        "tasks_pending": task_counts_data.get("pending", 0),
        "tasks_completed": task_counts_data.get("completed", 0),
        "today_attendance": for_date(today)[:8],
        "upcoming_tasks": tasks,
        "recent_activity": [serialize_doc(item) for item in activity],
        "upcoming_birthdays": birthdays,
        "note": note,
    })


@settings_bp.route("/api/activity", methods=["GET"])
@admin_required
def get_activity():
    limit = int(request.args.get("limit", 8))
    activity = recent_activity(limit)
    from backend.db import serialize_doc
    return jsonify([serialize_doc(a) for a in activity])


@settings_bp.route("/api/announcements", methods=["GET"])
def get_announcements():
    items = _announcement_items()
    latest = items[0]["content"] if items else "Welcome to PSM Office!"
    return jsonify({"announcement": latest, "announcements": items})


def _announcement_items():
    """Newest-first announcement history, back-filled from the legacy note."""
    items = list_announcements()
    if items:
        return items
    note = get_note()
    if note.get("content"):
        return [{
            "_id": "legacy",
            "content": note.get("content"),
            "created_at": note.get("created_at"),
            "author_id": None,
            "author_type": None,
            "author_name": None,
        }]
    return []


def _is_allowed_sender(person_id):
    if not person_id:
        return False
    return any(
        isinstance(sender, dict) and str(sender.get("person_id")) == str(person_id)
        for sender in get_announcement_senders()
    )


def _resolve_can_send():
    """Token identity when present, otherwise the explicit person_id.

    Mirrors the query-param fallback used by notifications/leave/tasks so an
    allocated sender can publish even when their stored access token is stale.
    """
    auth = current_auth()
    if auth:
        return can_send_announcement(auth)
    return _is_allowed_sender(request.args.get("person_id"))


@settings_bp.route("/api/announcements/permission", methods=["GET"])
def announcement_permission():
    """Whether the current token holder (or person_id) may publish."""
    return jsonify({"can_send": _resolve_can_send()})


@settings_bp.route("/api/announcements", methods=["POST"])
@announcement_sender_required
def save_announcement():
    data = request.get_json() or {}
    content = (data.get("content", "") or "").strip()
    if not content:
        return jsonify({"error": "Announcement content is required"}), 400

    auth = current_auth()
    if auth:
        allowed = can_send_announcement(auth)
        person_id = auth.get("sub")
        person_type = auth.get("person_type")
        author_name = auth.get("name")
    else:
        person_id = data.get("person_id") or request.args.get("person_id")
        person_type = data.get("person_type") or request.args.get("person_type")
        author_name = data.get("author_name")
        allowed = _is_allowed_sender(person_id)

    if not allowed:
        return jsonify({"error": "You are not allowed to send announcements"}), 403

    saved = add_announcement(
        content,
        author_id=person_id,
        author_type=person_type,
        author_name=author_name,
    )
    save_note(content)
    _broadcast_announcement(content)
    log_activity("Announcement Published", content[:80])
    return jsonify({"message": "Announcement saved", "announcement": saved})


@settings_bp.route("/api/announcement-senders", methods=["GET"])
@admin_required
def get_announcement_senders_route():
    return jsonify({"senders": get_announcement_senders()})


@settings_bp.route("/api/announcement-senders", methods=["POST"])
@admin_required
def update_announcement_senders_route():
    data = request.get_json() or {}
    raw = data.get("senders", [])
    clean = []
    seen = set()
    if isinstance(raw, list):
        for sender in raw:
            if not isinstance(sender, dict):
                continue
            person_id = sender.get("person_id")
            if not person_id or str(person_id) in seen:
                continue
            seen.add(str(person_id))
            clean.append({
                "person_id": str(person_id),
                "person_type": sender.get("person_type", "employee"),
                "name": sender.get("name", ""),
            })
    set_announcement_senders(clean)
    log_activity("Announcement Senders Updated", str(len(clean)))
    return jsonify({"message": "Senders updated", "senders": clean})


@settings_bp.route("/api/reports/<report_type>", methods=["GET"])
@admin_required
def generate_report(report_type):
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    db = get_db()

    if report_type == "attendance":
        from backend.models.attendance_model import report_summary_between
        if start_date and end_date:
            auto_mark_absent_range(start_date, end_date)
            data = report_summary_between(start_date, end_date)
        else:
            today = date_type.today()
            month_start = today.replace(day=1)
            auto_mark_absent_range(month_start, today)
            data = report_summary_between(
                month_start.isoformat(),
                today.isoformat(),
            )
    elif report_type == "employee":
        data = list(db.employees.find())
        from backend.db import serialize_doc
        data = [serialize_doc(d) for d in data]
    elif report_type == "intern":
        data = list(db.interns.find())
        from backend.db import serialize_doc
        data = [serialize_doc(d) for d in data]
    elif report_type == "task":
        query = {}
        if start_date and end_date:
            query["deadline"] = {"$gte": start_date, "$lte": end_date}
        data = list(db.tasks.find(query).sort("deadline", 1))
        from backend.db import serialize_doc
        data = [serialize_doc(d) for d in data]
    elif report_type == "finance":
        query = {}
        if start_date and end_date:
            query["date"] = {"$gte": start_date, "$lte": end_date}
        data = list(db.finance.find(query).sort("date", -1))
        from backend.db import serialize_doc
        data = [serialize_doc(d) for d in data]
    else:
        return jsonify({"error": "Invalid report type"}), 400

    return jsonify(data)

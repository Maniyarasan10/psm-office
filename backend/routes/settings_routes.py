from flask import Blueprint, request, jsonify
from backend.models.settings_model import (
    get_settings,
    update_settings,
    get_announcement_senders,
    set_announcement_senders,
)
from backend.utils.activity_log import log_activity, recent_activity
from backend.models.note_model import get_note, save_note
from backend.models.announcement_model import (
    add_announcement,
    list_announcements,
    delete_announcement,
)
from backend.models.employee_model import (
    count_active_employees,
    count_remote_workers,
    upcoming_birthdays,
)
from backend.models.intern_model import count_interns
from backend.models.task_model import task_counts, upcoming_tasks
from backend.models.attendance_model import (
    today_summary, for_date, report_between, auto_mark_absent, auto_mark_absent_range,
)
from backend.db import get_db
from backend.utils.push_utils import send_push
from backend.models import notification_model
from backend import config
from backend.utils.auth import (
    admin_required,
    announcement_sender_required,
    can_send_announcement,
    current_auth,
)
from datetime import date as date_type, datetime

settings_bp = Blueprint("settings", __name__)


def _broadcast_announcement(content, topic=None):
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
    title = (topic or "").strip() or "New announcement"
    if recipients:
        notification_model.add_bulk_notifications(
            recipients, title, body,
            route="announcements", category="Announcement",
        )
    # Nudge open apps so the Announcements screen reloads while it is visible.
    try:
        from backend.realtime import notify_all
        notify_all("announcement")
    except Exception:
        pass
    if not tokens:
        return
    send_push(tokens, title, body, data={"route": "announcements"})


def _broadcast_custom_notification(title, body="", route="notifications",
                                   category="Notification", recipients=None):
    """Broadcast a custom notification to selected people or everyone.

    ``recipients`` is an optional list of ``(person_type, person_id)`` pairs.
    When omitted every employee and intern receives the notification.

    Returns a summary with the number of inbox recipients and the number of
    devices that received a push notification.
    """
    summary = {"recipients": 0, "pushed": 0}
    if not title and not body:
        return summary
    db = get_db()
    requested = None
    if recipients is not None:
        requested = {
            (str(ptype).lower(), str(person_id))
            for ptype, person_id in recipients
            if person_id
        }
        if not requested:
            return summary
    tokens = []
    targets = []
    if db is not None:
        for collection, ptype in ((db.employees, "employee"), (db.interns, "intern")):
            for doc in collection.find({}, {"push_token": 1}):
                key = (ptype, str(doc.get("_id")))
                if requested is not None and key not in requested:
                    continue
                targets.append(key)
                token = doc.get("push_token")
                if isinstance(token, str) and token:
                    tokens.append(token)
    if requested is not None and not targets:
        return summary
    notification_title = (title or "").strip() or "Notification"
    notification_body = (body or "").strip()
    if targets:
        try:
            notification_model.add_bulk_notifications(
                targets, notification_title, notification_body,
                route=route, category=category,
            )
        except Exception:
            pass
    summary["recipients"] = len(targets)
    try:
        from backend.realtime import notify_all
        notify_all("notification")
    except Exception:
        pass
    if tokens:
        try:
            # With no message body the title is the whole notification. Pass it
            # as the body and leave the title empty so Android/iOS render the
            # text once instead of repeating it as title + body.
            if notification_body:
                send_push(tokens, notification_title, notification_body, data={"route": route})
            else:
                send_push(tokens, "", notification_title, data={"route": route})
            summary["pushed"] = len(tokens)
        except Exception:
            pass
    if db is not None:
        try:
            db.custom_notifications.insert_one({
                "title": notification_title,
                "body": notification_body,
                "route": route,
                "category": category,
                "recipients": summary["recipients"],
                "pushed": summary["pushed"],
                "sent_at": datetime.utcnow(),
            })
        except Exception:
            pass
    return summary


@settings_bp.route("/api/notifications/send", methods=["POST"])
@admin_required
def send_custom_notification():
    """Send an admin-authored notification to everyone or selected people."""
    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title:
        return jsonify({"error": "Notification title is required"}), 400

    send_to_all = bool(data.get("send_to_all"))
    raw_recipients = data.get("recipients")
    recipients = None
    if not send_to_all and raw_recipients is not None:
        recipients = []
        seen = set()
        if isinstance(raw_recipients, list):
            for item in raw_recipients:
                if not isinstance(item, dict):
                    continue
                person_id = item.get("person_id")
                person_type = (item.get("person_type") or "employee").strip().lower()
                if not person_id or person_type not in ("employee", "intern"):
                    continue
                key = f"{person_type}:{person_id}"
                if key in seen:
                    continue
                seen.add(key)
                recipients.append((person_type, str(person_id)))
        if not recipients:
            return jsonify({"error": "Select at least one recipient"}), 400

    summary = _broadcast_custom_notification(title, body, recipients=recipients)
    if recipients is not None and summary["recipients"] == 0:
        return jsonify({"error": "Selected recipients were not found"}), 404
    scope = "all employees and interns" if recipients is None else "selected recipients"
    log_activity("Custom Notification Sent", title[:80])
    return jsonify({
        "message": f"Notification sent to {scope}",
        **summary,
    })


@settings_bp.route("/api/notifications/sent", methods=["GET"])
@admin_required
def custom_notification_log():
    """Recent admin-broadcast notifications, newest first."""
    db = get_db()
    if db is None:
        return jsonify([])
    from backend.db import serialize_doc

    try:
        limit = min(int(request.args.get("limit", 30)), 100)
    except (TypeError, ValueError):
        limit = 30
    docs = list(
        db.custom_notifications.find({}).sort("sent_at", -1).limit(limit)
    )
    return jsonify([serialize_doc(doc) for doc in docs])


@settings_bp.route("/api/settings", methods=["GET"])
def get_settings_route():
    settings = get_settings()
    # Allocation of announcement senders is an admin list; it must not leak
    # through the public settings bootstrap endpoint.
    settings.pop("announcement_senders", None)
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


@settings_bp.route("/api/storage", methods=["GET"])
@admin_required
def storage_stats():
    """Database footprint plus the media backend in use.

    Handy for keeping an eye on the MongoDB Atlas free tier budget: file
    bodies live in Cloudinary, so only metadata is stored here.
    """
    db = get_db()
    from backend.utils import storage

    collections = []
    total = 0
    try:
        for name in db.list_collection_names():
            try:
                stats = db.command("collStats", name)
            except Exception:
                continue
            size = int(stats.get("size", 0))
            total += size
            collections.append({
                "name": name,
                "size_bytes": size,
                "count": int(stats.get("count", 0)),
            })
        collections.sort(key=lambda item: item["size_bytes"], reverse=True)
    except Exception:
        collections = []

    return jsonify({
        "database": config.db_name(),
        "total_size_bytes": total,
        "collections": collections,
        "media": storage.status(detailed=True),
    })


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
    remote_workers = count_remote_workers()
    birthdays = upcoming_birthdays(30)
    tasks = upcoming_tasks(8)
    activity = recent_activity(8)
    note = get_note()

    from backend.db import serialize_doc

    return jsonify({
        "total_employees": active_employees,
        "total_interns": total_interns,
        "total_workforce": active_employees + total_interns,
        "present_today": attendance.get("present", 0),
        "absent_today": attendance.get("absent", 0),
        "remote_workers": remote_workers,
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
    latest = items[0] if items else None
    content = latest["content"] if latest else "Welcome to PSM Office!"
    topic = latest.get("topic") if latest else ""
    return jsonify({"announcement": content, "topic": topic, "announcements": items})


def _announcement_items():
    """Newest-first announcement history, back-filled from the legacy note."""
    items = list_announcements()
    if items:
        return items
    note = get_note()
    if note.get("content"):
        return [{
            "_id": "legacy",
            "topic": "",
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
    topic = (data.get("topic", "") or "").strip()
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
        topic=topic,
        author_id=person_id,
        author_type=person_type,
        author_name=author_name,
    )
    save_note(content)
    _broadcast_announcement(content, topic)
    log_activity("Announcement Published", content[:80])
    return jsonify({"message": "Announcement saved", "announcement": saved})


@settings_bp.route("/api/announcements/<announcement_id>", methods=["DELETE"])
@admin_required
def delete_announcement_route(announcement_id):
    if announcement_id == "legacy":
        save_note("")
        log_activity("Announcement Deleted", "legacy note")
        return jsonify({"message": "Announcement deleted"})

    if not delete_announcement(announcement_id):
        return jsonify({"error": "Announcement not found"}), 404

    # Keep the mobile home screen showing the newest one that remains.
    remaining = list_announcements()
    save_note(remaining[0]["content"] if remaining else "")
    log_activity("Announcement Deleted", announcement_id)
    return jsonify({"message": "Announcement deleted"})


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

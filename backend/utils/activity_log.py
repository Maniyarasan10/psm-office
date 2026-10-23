from datetime import datetime
from backend.db import get_db, serialize_doc

_ACTIVITY_META = {
    "File Uploaded": ("New document uploaded", "documents", "/documents"),
    "File Deleted": ("Document deleted", "documents", "/documents"),
    "Document Visibility Updated": ("Document visibility updated", "documents", "/documents"),
    "Announcement Published": ("New announcement published", "announcements", "/announcements"),
    "Announcement Deleted": ("Announcement deleted", "announcements", "/announcements"),
    "Announcement Senders Updated": ("Announcement senders updated", "announcements", "/announcements"),
    "Task Created": ("New task created", "tasks", "/tasks"),
    "Task Updated": ("Task updated", "tasks", "/tasks"),
    "Task Deleted": ("Task deleted", "tasks", "/tasks"),
    "Task Assigned": ("Task assigned", "tasks", "/tasks"),
    "Task Comment Added": ("New task message", "tasks", "/tasks"),
    "Leave Request": ("New leave request", "leave", "/leave"),
    "Leave Approved": ("Leave approved", "leave", "/leave"),
    "Leave Rejected": ("Leave rejected", "leave", "/leave"),
    "Attendance Marked": ("Attendance marked", "attendance", "/attendance"),
    "Clock In": ("Clock in", "attendance", "/attendance"),
    "Clock Out": ("Clock out", "attendance", "/attendance"),
    "Mobile Clock In": ("Mobile clock in", "attendance", "/attendance"),
    "Project Created": ("New project created", "projects", "/projects"),
    "Project Updated": ("Project updated", "projects", "/projects"),
    "Project Deleted": ("Project deleted", "projects", "/projects"),
    "Project Status Updated": ("Project status updated", "projects", "/projects"),
    "Project Members Updated": ("Project members updated", "projects", "/projects"),
    "Employee Created": ("New employee added", "employees", "/employees"),
    "Employee Updated": ("Employee details updated", "employees", "/employees"),
    "Employee Deleted": ("Employee removed", "employees", "/employees"),
    "Intern Created": ("New intern added", "interns", "/interns"),
    "Intern Updated": ("Intern details updated", "interns", "/interns"),
    "Intern Deleted": ("Intern removed", "interns", "/interns"),
    "Finance Transaction Created": ("New finance entry", "finance", "/finance"),
    "Finance Transaction Updated": ("Finance entry updated", "finance", "/finance"),
    "Finance Transaction Deleted": ("Finance entry deleted", "finance", "/finance"),
    "Custom Notification Sent": ("Custom notification sent", "notifications", "/notifications"),
    "Settings Updated": ("Settings updated", "settings", "/settings"),
    "Support Ticket Created": ("New support request", "support", None),
    "Support Response Added": ("Support reply added", "support", None),
    "Support Status Updated": ("Support status updated", "support", None),
    "Support Priority Updated": ("Support priority updated", "support", None),
    "Support Ticket Cancelled": ("Support ticket cancelled", "support", None),
    "Support Ticket Confirmed": ("Support ticket confirmed", "support", None),
    "Support Ticket Reopened": ("Support ticket reopened", "support", None),
}


def log_activity(action, details=""):
    db = get_db()
    db.activity_log.insert_one({
        "action": action,
        "details": details,
        "timestamp": datetime.utcnow(),
    })


def recent_activity(limit=8):
    db = get_db()
    docs = list(db.activity_log.find().sort("timestamp", -1).limit(limit))
    return docs


def notification_feed(limit=100):
    """Recent activity shaped for the admin notification bell and badges."""
    items = []
    for doc in recent_activity(limit):
        action = doc.get("action") or ""
        title, section, route = _ACTIVITY_META.get(
            action, (action or "Activity", None, None)
        )
        items.append({
            "_id": str(doc.get("_id")),
            "action": action,
            "title": title,
            "details": doc.get("details") or "",
            "section": section,
            "route": route,
            "timestamp": serialize_doc(doc).get("timestamp"),
        })
    return items

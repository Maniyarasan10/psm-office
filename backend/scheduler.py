"""Background scheduler for the daily work-report reminder.

There is no dedicated cron library in this project (it runs a single gunicorn
worker and the WebSocket broker is in-memory), so a lightweight daemon thread
wakes every 60 seconds and fires the reminder when the configured time of day
is reached. This mirrors the existing auto-absent worker pattern in app.py.
"""
import os
import threading
import time
from datetime import datetime

from backend import config
from backend.db import get_db
from backend.models.report_model import submitted_today
from backend.utils.notify import notify_person


def _loop():
    """Run until the process exits; fire the reminder once per day."""
    last_sent_date = None
    while True:
        try:
            now = datetime.now()
            today = now.date().isoformat()

            if (
                config.daily_report_reminder_enabled()
                and now.hour == config.report_reminder_hour()
                and now.minute == config.report_reminder_minute()
                and last_sent_date != today
            ):
                _send_daily_reminders(today)
                last_sent_date = today

            # Reset the sent flag at midnight so the next day's reminder fires.
            if last_sent_date is not None and last_sent_date != today:
                last_sent_date = None
        except Exception as exc:  # pragma: no cover - keep the thread alive
            print(f"Report reminder scheduler error: {exc}")
        time.sleep(60)


def _send_daily_reminders(today):
    """Push + inbox nudge everyone who has not submitted a report for today."""
    db = get_db()
    if db is None:
        return

    submitted = set()
    for doc in db.daily_reports.find({"date": today}):
        submitted.add((doc.get("person_type"), doc.get("person_id")))

    recipients = []
    for doc in db.employees.find({}, {"_id": 1, "name": 1}):
        key = ("employee", str(doc["_id"]))
        if key not in submitted:
            recipients.append(("employee", str(doc["_id"]), doc.get("name") or "Employee"))
    for doc in db.interns.find({}, {"_id": 1, "name": 1}):
        key = ("intern", str(doc["_id"]))
        if key not in submitted:
            recipients.append(("intern", str(doc["_id"]), doc.get("name") or "Intern"))

    for person_type, person_id, name in recipients:
        notify_person(
            person_type,
            person_id,
            "Submit today's work report",
            f"Hi {name}, please submit your work progress for {today}.",
            route="reports",
            category="report_reminder",
            dedupe_key=f"daily_report_reminder:{today}:{person_id}",
        )


def start_scheduler(app):
    """Start the reminder thread unless background workers are disabled."""
    if os.getenv("DISABLE_BACKGROUND_WORKERS", "").strip().lower() in ("1", "true", "yes"):
        app.logger.info("Report reminder scheduler disabled (DISABLE_BACKGROUND_WORKERS).")
        return
    thread = threading.Thread(target=_loop, daemon=True, name="daily-report-reminder")
    thread.start()
    app.logger.info("Daily report reminder scheduler started")

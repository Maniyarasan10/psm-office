"""Unified per-person notification: persist to the inbox and push.

Persisting guarantees the mobile Notifications screen still shows the event
even when a push is missed; the push is a best-effort real-time nudge. Both are
best-effort and never raise into the caller's response path.
"""
from backend.models import notification_model
from backend.utils.push_utils import send_push, person_push_token
from backend.realtime import notify_event


def notify_person(person_type, person_id, title, body="", route=None,
                  category=None, ref_id=None, data=None, dedupe_key=None):
    """Record a notification for one person and attempt a push to their device.

    ``data`` overrides the push deep-link payload; when omitted a minimal
    ``{"route": route}`` map is sent so the app can navigate on tap.
    """
    if not person_id:
        return
    ptype = (person_type or "employee").strip().lower() or "employee"
    try:
        notification_model.add_notification(
            ptype,
            person_id,
            title,
            body=body,
            route=route,
            category=category,
            ref_id=ref_id,
            dedupe_key=dedupe_key,
        )
    except Exception as exc:
        print(f"Notification persist skipped: {exc}")

    # Nudge any open websocket so the Notifications screen refreshes live.
    try:
        notify_event(person_id, "notification", title=title, route=route)
    except Exception as exc:
        print(f"Notification realtime skipped: {exc}")

    token = person_push_token(person_id, ptype)
    if not token:
        return
    payload = dict(data or {})
    if route and "route" not in payload:
        payload["route"] = route
    try:
        send_push([token], title, body or title, data=payload)
    except Exception as exc:
        print(f"Notification push skipped: {exc}")

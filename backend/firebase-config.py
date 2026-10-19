"""Optional Firebase Cloud Messaging helper.

NOTE: the app pushes notifications through Expo (see backend/utils/push_utils.py),
so this module is not part of the request path. It is kept for reference and is
only usable when firebase-admin is installed *and* credentials are configured:

  - FIREBASE_CREDENTIALS_JSON  raw service-account JSON (or its base64 encoding)
  - FIREBASE_CREDENTIALS       path to a service-account JSON file
  - default                    backend/firebase-admin.json (local development)

Credential files are never committed (see backend/.gitignore). Import is now
lazy so a missing key file can never crash the process at import time.
"""
import base64
import json
import os

_default = os.path.join(os.path.dirname(__file__), "firebase-admin.json")
_app = None


def credentials_info():
    """Return (dict_or_None, path_or_None) describing the service account.

    Prefer the env-var dict form; fall back to a certificate file path.
    """
    raw = (os.getenv("FIREBASE_CREDENTIALS_JSON", "") or "").strip()
    if raw:
        text = raw
        if not text.lstrip().startswith("{"):
            try:
                text = base64.b64decode(raw).decode("utf-8")
            except Exception as exc:
                raise RuntimeError(
                    "FIREBASE_CREDENTIALS_JSON is neither JSON nor valid base64."
                ) from exc
        try:
            return json.loads(text), None
        except ValueError as exc:
            raise RuntimeError("FIREBASE_CREDENTIALS_JSON is not valid JSON.") from exc
    path = (os.getenv("FIREBASE_CREDENTIALS", "") or "").strip() or _default
    return None, path


def _get_app():
    global _app
    if _app is not None:
        return _app
    info, path = credentials_info()
    if info is None and not os.path.exists(path):
        raise RuntimeError(
            "Firebase credentials not configured; set FIREBASE_CREDENTIALS_JSON "
            "(inline JSON) or FIREBASE_CREDENTIALS (file path) to enable FCM."
        )
    import firebase_admin
    from firebase_admin import credentials

    if not firebase_admin._apps:
        cert = credentials.Certificate(info) if info is not None else credentials.Certificate(path)
        _app = firebase_admin.initialize_app(cert)
    else:
        _app = firebase_admin.get_app()
    return _app


def send_push_notification(token, title, body, data=None):
    """Send a push notification via FCM to a single device token."""
    from firebase_admin import messaging

    _get_app()
    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        token=token,
        data=data or {},
    )
    return messaging.send(message)


def send_bulk_notification(tokens, title, body, data=None):
    """Send to multiple devices."""
    from firebase_admin import messaging

    _get_app()
    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        tokens=tokens,
        data=data or {},
    )
    return messaging.send_each_for_multicast(message)

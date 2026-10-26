import json
import logging
import os
import sys
import time
from dotenv import load_dotenv
from flask import Flask, g, send_from_directory, request, jsonify, Response, redirect
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from flask_sock import Sock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import config
from backend.db import get_db
from backend.routes.employee_routes import employee_bp
from backend.routes.intern_routes import intern_bp
from backend.routes.attendance_routes import attendance_bp
from backend.routes.leave_routes import leave_bp
from backend.routes.task_routes import task_bp
from backend.routes.project_routes import project_bp
from backend.routes.document_routes import document_bp
from backend.routes.settings_routes import settings_bp
from backend.routes.report_routes import report_bp
from backend.routes.auth_routes import auth_bp
from backend.routes.finance_routes import finance_bp
from backend.routes.backup_routes import backup_bp
from backend.routes.support_routes import support_bp
from backend.routes.notification_routes import notification_bp
from backend.routes.personal_calendar_routes import personal_calendar_bp
from backend.utils.photo_utils import (
    store_photo,
    get_photo,
    migrate_photos_to_storage,
)
from backend.utils import storage
from backend.utils import media_tokens
from backend.utils.auth import verify_token, auth_required
from backend.utils.uploads import validate_image_upload
from backend.scheduler import start_scheduler

sock = Sock()


def _start_auto_absent_worker(app):
    if os.getenv("DISABLE_BACKGROUND_WORKERS", "").strip().lower() in ("1", "true", "yes"):
        app.logger.info(
            "Auto-absent worker disabled (DISABLE_BACKGROUND_WORKERS); "
            "run the task on a schedule instead."
        )
        return

    import threading
    import time
    from datetime import date as date_type

    def worker():
        while True:
            try:
                from backend.models.attendance_model import auto_mark_absent
                result = auto_mark_absent(date_type.today())
                if result.get("marked"):
                    app.logger.info(
                        "Auto-absent: marked %s people absent for %s",
                        result["marked"],
                        date_type.today(),
                    )
            except Exception as exc:
                app.logger.error("Auto-absent worker error: %s", exc)
            time.sleep(600)

    thread = threading.Thread(target=worker, daemon=True, name="auto-absent-worker")
    thread.start()


_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "geolocation=(self), camera=(self), microphone=()",
}

# Content-Security-Policy for API responses. The SPA is served by the same app
# when a frontend build is present, so a conservative policy is applied there
# too; blob:/data: are allowed for image previews and inline styles/scripts are
# kept permissive enough for the bundled React build.
_API_CSP = (
    "default-src 'self'; "
    "img-src 'self' data: blob: https:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self' 'unsafe-eval'; "
    "connect-src 'self' https: wss:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "object-src 'none'"
)

_MEDIA_KEYS = {
    "photo_path",
    "profile_photo_path",
    "photoPath",
    "file_url",
    "attachment_url",
}


def _signed_media_value(value):
    if not isinstance(value, str) or not value:
        return value
    if value.startswith("cloudinary://"):
        return storage.delivery_url(value)
    if value.startswith("/uploads/") or value.startswith("/api/photo/"):
        return media_tokens.sign_path(value)
    parsed = storage.parse_cloudinary_url(value)
    if parsed and parsed.get("delivery_type") == "authenticated":
        # Older rows may contain a signed delivery URL. Re-sign it from the
        # reference so the response never carries an expired signature.
        return storage.delivery_url(
            f"cloudinary://{parsed['resource_type']}/{parsed['public_id']}"
        )
    return value


def _sign_media_payload(payload):
    """Rewrite photo paths in an API response so clients never see raw paths."""
    changed = False
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in _MEDIA_KEYS and isinstance(value, str):
                signed = _signed_media_value(value)
                if signed != value:
                    payload[key] = signed
                    changed = True
            elif isinstance(value, (dict, list)):
                changed = _sign_media_payload(value) or changed
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, (dict, list)):
                changed = _sign_media_payload(item) or changed
    return changed


def _media_allowed(path):
    """Signed URL or an authenticated session may read a private file."""
    if media_tokens.verify_request(path, request.args):
        return True
    from backend.utils.auth import current_auth

    return current_auth() is not None


def create_app():
    app = Flask(__name__)

    # Heroku/Cloudflare terminate TLS in front of the dyno. Trust exactly one
    # proxy hop so request.is_secure, redirects and client IPs are correct.
    if config.trust_proxy():
        app.wsgi_app = ProxyFix(
            app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1
        )

    # Fail fast when the process is started with insecure production settings.
    config.assert_valid_config()

    origins = config.cors_origins()
    CORS(app, origins=origins, supports_credentials=True)

    app.config["SECRET_KEY"] = config.session_secret()
    app.config["MAX_CONTENT_LENGTH"] = config.max_content_length()
    app.config["DEBUG"] = os.getenv("FLASK_DEBUG", "0") == "1" and not config.is_production()
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = config.force_https()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        force=True,
    )
    logging.getLogger("werkzeug").setLevel(logging.INFO)
    app.logger.setLevel(logging.INFO)
    app.logger.propagate = True

    if config.is_production() and not config.auth_required():
        app.logger.warning(
            "AUTH_REQUIRED is off; protected endpoints are not enforcing tokens."
        )

    @app.before_request
    def redirect_to_https():
        if not config.force_https() or request.is_secure:
            return None
        # WebSocket clients negotiate a wss:// URL themselves; redirecting the
        # HTTP upgrade would break some clients.
        if request.path == "/api/ws":
            return None
        url = request.url
        if url.startswith("http://"):
            url = "https://" + url[len("http://"):]
        return redirect(url, code=308)

    @app.before_request
    def log_request_start():
        g.start_time = time.time()
        app.logger.info("REQUEST %s %s", request.method, request.path)

    @app.after_request
    def log_request_end(response):
        if config.security_headers_enabled():
            for header, value in _SECURITY_HEADERS.items():
                response.headers.setdefault(header, value)
            response.headers.setdefault("Content-Security-Policy", _API_CSP)
            if config.force_https():
                response.headers.setdefault(
                    "Strict-Transport-Security",
                    "max-age=31536000; includeSubDomains",
                )

        if response.is_json:
            payload = response.get_json(silent=True)
            if payload is not None and _sign_media_payload(payload):
                response.set_data(json.dumps(payload))

        start_time = getattr(g, "start_time", None)
        if start_time is not None:
            duration_ms = round((time.time() - start_time) * 1000, 2)
            app.logger.info(
                "RESPONSE %s %s %s in %.2fms",
                request.method, request.path, response.status_code, duration_ms,
            )
        return response

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify({"error": "Request payload too large"}), 413

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "API endpoint not found"}), 404
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def internal_error(_error):
        # Never leak exception details to clients.
        app.logger.exception("Unhandled server error")
        return jsonify({"error": "Internal server error"}), 500

    app.register_blueprint(employee_bp)
    app.register_blueprint(intern_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(leave_bp)
    app.register_blueprint(task_bp)
    app.register_blueprint(project_bp)
    app.register_blueprint(document_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(report_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(finance_bp)
    app.register_blueprint(backup_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(notification_bp)
    app.register_blueprint(personal_calendar_bp)

    get_db()
    migrate_photos_to_storage()

    if storage.cloudinary_ready():
        app.logger.info(
            "Media storage: Cloudinary (cloud %s, folder %s)",
            config.cloudinary_cloud_name(),
            config.cloudinary_folder(),
        )
    else:
        app.logger.warning(
            "Media storage: LOCAL DISK - set CLOUDINARY_CLOUD_NAME / "
            "CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET to store files in the cloud."
        )

    _start_auto_absent_worker(app)
    start_scheduler(app)

    sock.init_app(app)

    @sock.route("/api/ws")
    def realtime_socket(ws):
        """Realtime channel: authenticates by token, then keeps the socket open.

        The mobile client sends ``{"type": "auth", "token": ...}`` as its first
        frame so the token never appears in the URL or server access logs. The
        ``?token=`` query parameter is still accepted for older web clients.
        Malformed or expired tokens are rejected by closing immediately.
        """
        from backend.realtime import broker

        payload = verify_token(request.args.get("token", ""), expected_type="access")
        if not payload:
            try:
                first_frame = ws.receive(timeout=10)
            except Exception:
                first_frame = None
            if first_frame:
                try:
                    message = json.loads(first_frame)
                except (TypeError, ValueError):
                    message = None
                if isinstance(message, dict) and message.get("type") == "auth":
                    candidate = message.get("token")
                    if isinstance(candidate, str):
                        payload = verify_token(candidate.strip(), expected_type="access")
        if not payload:
            try:
                ws.close()
            except Exception:
                pass
            return

        person_id = payload.get("sub")
        broker.register(person_id, ws)
        try:
            ws.send(json.dumps({"type": "connected"}))
            while True:
                data = ws.receive()
                if data is None:
                    break
                # Inbound frames are ignored; this loop just detects disconnects.
        except Exception:
            pass
        finally:
            broker.unregister(person_id, ws)

    app.logger.info("PSM Office backend is starting")

    uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
    profiles_dir = os.path.join(uploads_dir, "profiles")
    os.makedirs(profiles_dir, exist_ok=True)

    @app.route("/uploads/attendance/<path:filename>")
    def serve_attendance_photo(filename):
        path = f"/uploads/attendance/{filename}"
        if not _media_allowed(path):
            return jsonify({"error": "Unauthorized"}), 401
        attendance_dir = os.path.join(uploads_dir, "attendance")
        response = send_from_directory(attendance_dir, filename)
        response.headers["Cache-Control"] = "private, max-age=3600"
        return response

    @app.route("/uploads/profiles/<path:filename>")
    def serve_profile_photo(filename):
        path = f"/uploads/profiles/{filename}"
        if not _media_allowed(path):
            return jsonify({"error": "Unauthorized"}), 401
        response = send_from_directory(profiles_dir, filename)
        response.headers["Cache-Control"] = "private, max-age=3600"
        return response

    @app.route("/uploads/<path:filename>")
    def serve_stored_file(filename):
        """Serve files kept on local disk (the no-Cloudinary fallback)."""
        path = f"/uploads/{filename}"
        if not _media_allowed(path):
            return jsonify({"error": "Unauthorized"}), 401
        response = send_from_directory(uploads_dir, filename)
        response.headers["Cache-Control"] = "private, max-age=3600"
        return response

    @app.route("/api/photo/<photo_id>")
    def serve_photo(photo_id):
        path = f"/api/photo/{photo_id}"
        if not _media_allowed(path):
            return jsonify({"error": "Unauthorized"}), 401
        result = get_photo(photo_id)
        if result is None:
            return jsonify({"error": "Photo not found"}), 404
        raw_bytes, mime = result
        response = Response(raw_bytes, mimetype=mime)
        response.headers["Cache-Control"] = "private, max-age=3600"
        return response

    @app.route("/api/upload/profile", methods=["POST"])
    @auth_required
    def upload_profile_photo():
        if "photo" not in request.files:
            return jsonify({"error": "No photo provided"}), 400
        photo = request.files["photo"]
        if not photo.filename:
            return jsonify({"error": "Empty filename"}), 400

        raw_bytes, mime, error = validate_image_upload(photo)
        if error:
            return jsonify({"error": error}), 400
        url = store_photo(raw_bytes, mime)
        if not url:
            return jsonify({"error": "Storage unavailable"}), 500
        return jsonify({"photo_path": url})

    @app.route("/api/health")
    def health():
        """Lightweight liveness/readiness probe (no sensitive details)."""
        database_ok = get_db() is not None
        status = "ok" if database_ok else "degraded"
        return jsonify({
            "status": status,
            "database": database_ok,
            "storage": storage.status(),
        }), (200 if database_ok else 503)

    @app.route("/")
    def index():
        frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
        if os.path.exists(frontend_dir):
            return send_from_directory(frontend_dir, "index.html")
        return {"message": "PSM Office Manager API is running. Frontend not built yet."}

    @app.route("/<path:path>")
    def serve_frontend(path):
        if path.startswith("api/"):
            return jsonify({"error": "API endpoint not found"}), 404

        frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
        if os.path.exists(frontend_dir) and os.path.exists(os.path.join(frontend_dir, path)):
            return send_from_directory(frontend_dir, path)
        if os.path.exists(frontend_dir):
            return send_from_directory(frontend_dir, "index.html")
        return {"error": "Not found"}, 404

    return app


app = create_app()

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1" and not config.is_production()
    app.run(host=host, port=port, debug=debug)

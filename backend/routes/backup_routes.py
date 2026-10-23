import io
import json
import os
import zipfile
from datetime import datetime

import gridfs
from flask import Blueprint, jsonify, request, send_file
from pymongo import DESCENDING

from backend.db import get_db, serialize_doc
from backend.utils.auth import admin_required
from backend.utils import storage

backup_bp = Blueprint("backup", __name__)

UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads"
)

COLLECTIONS = [
    "employees",
    "interns",
    "attendance",
    "tasks",
    "documents",
    "finance",
    "settings",
    "activity_log",
    "notes",
    "photos",
    "leave_requests",
    "support_tickets",
    "announcements",
    "notifications",
    "push_tokens",
    "password_resets",
    "auth_token_versions",
]


def _gridfs():
    db = get_db()
    if db is None:
        raise RuntimeError("Database not connected")
    return gridfs.GridFS(db, collection="backups")


def dump_db():
    db = get_db()
    data = {}
    for coll_name in COLLECTIONS:
        try:
            docs = list(db[coll_name].find())
            data[coll_name] = [serialize_doc(d) for d in docs]
        except Exception:
            continue
    return data


def restore_db(data):
    db = get_db()
    if db is None:
        raise RuntimeError("Database not connected")
    for coll_name, docs in data.items():
        if coll_name not in COLLECTIONS:
            continue
        # Never restore GridFS internals.
        if coll_name.startswith("fs."):
            continue
        try:
            db[coll_name].delete_many({})
        except Exception:
            continue
        if docs:
            clean = []
            for d in docs:
                d.pop("_id", None)
                clean.append(d)
            try:
                if clean:
                    db[coll_name].insert_many(clean)
            except Exception:
                continue


def make_backup_zip():
    data = dump_db()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("backup.json", json.dumps(data, indent=2, default=str))
        if os.path.exists(UPLOADS_DIR):
            for root, dirs, files in os.walk(UPLOADS_DIR):
                for f in files:
                    fpath = os.path.join(root, f)
                    arcname = os.path.relpath(fpath, UPLOADS_DIR)
                    # Store as uploads/<relative> to match existing format
                    zf.write(fpath, os.path.join("uploads", arcname))
    buf.seek(0)
    return buf


def parse_backup_zip(buf):
    with zipfile.ZipFile(buf) as zf:
        names = zf.namelist()
        if "backup.json" not in names:
            raise ValueError("Invalid backup: missing backup.json")
        with zf.open("backup.json") as f:
            data = json.loads(f.read().decode("utf-8"))
        upload_entries = {}
        for name in names:
            if name.startswith("uploads/") and not name.endswith("/"):
                # Normalize to prevent path traversal
                cleaned = os.path.normpath(name)
                if cleaned.startswith("..") or not cleaned.startswith("uploads"):
                    continue
                upload_entries[cleaned] = zf.read(name)
    return data, upload_entries


@backup_bp.route("/api/backup", methods=["POST"])
@admin_required
def create_backup():
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.zip"
        buf = make_backup_zip()
        content = buf.getvalue()

        fs = _gridfs()
        # Overwrite if same name exists
        try:
            for old in fs.find({"filename": filename}):
                fs.delete(old._id)
        except Exception:
            pass

        file_id = fs.put(
            content,
            filename=filename,
            content_type="application/zip",
            created_at=datetime.utcnow(),
        )
        return jsonify(
            {
                "message": "Backup created",
                "filename": filename,
                "size_kb": round(len(content) / 1024, 1),
                "created_at": timestamp,
                "file_id": str(file_id),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@backup_bp.route("/api/backups", methods=["GET"])
@admin_required
def list_backups():
    try:
        fs = _gridfs()
        files = []
        for f in fs.find().sort("uploadDate", DESCENDING):
            files.append(
                {
                    "filename": f.filename,
                    "size_kb": round((f.length or 0) / 1024, 1),
                    "created_at": (
                        f.uploadDate.isoformat()
                        if getattr(f, "uploadDate", None)
                        else ""
                    ),
                    "file_id": str(f._id),
                }
            )
        return jsonify(files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@backup_bp.route("/api/backups/<filename>", methods=["GET"])
@admin_required
def download_backup(filename):
    if ".." in filename or "/" in filename or "\\" in filename:
        return jsonify({"error": "Invalid filename"}), 400
    try:
        fs = _gridfs()
        grid_out = fs.find_one({"filename": filename})
        if grid_out is None:
            return jsonify({"error": "Backup not found"}), 404
        data = grid_out.read()
        buf = io.BytesIO(data)
        buf.seek(0)
        return send_file(
            buf,
            as_attachment=True,
            download_name=filename,
            mimetype="application/zip",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@backup_bp.route("/api/backup/restore", methods=["POST"])
@admin_required
def restore_backup():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    f = request.files["file"]
    if not f or not f.filename or not f.filename.lower().endswith(".zip"):
        return jsonify({"error": "Must be a .zip file"}), 400

    try:
        buf = io.BytesIO(f.read())
        data, upload_entries = parse_backup_zip(buf)
        restore_db(data)

        uploads_parent = os.path.dirname(UPLOADS_DIR)
        restored_uploads = 0
        for arcname, content in upload_entries.items():
            # arcname is like uploads/foo/bar.png
            dest = os.path.normpath(os.path.join(uploads_parent, arcname))
            # Ensure we don't write outside uploads parent
            if not dest.startswith(os.path.normpath(uploads_parent) + os.sep) and dest != os.path.normpath(
                uploads_parent
            ):
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            try:
                with open(dest, "wb") as out:
                    out.write(content)
                restored_uploads += 1
            except Exception:
                continue

        return jsonify(
            {
                "message": f"Restored {sum(len(v) for v in data.values())} records across {len(data)} collections; {restored_uploads} local uploads restored"
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

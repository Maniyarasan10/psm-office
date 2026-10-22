import os
import json
import zipfile
import io
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from backend.db import get_db, serialize_doc
from backend.utils.auth import admin_required

backup_bp = Blueprint("backup", __name__)

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backups")
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(BACKUP_DIR, exist_ok=True)

COLLECTIONS = [
    "employees", "interns", "attendance", "tasks",
    "documents", "finance", "settings", "activity_log", "notes", "photos"
]
# "photos" is legacy: photos live in Cloudinary now, so the collection is
# normally empty. It stays in the list so an older backup still restores.


def dump_db():
    db = get_db()
    data = {}
    for coll_name in COLLECTIONS:
        docs = list(db[coll_name].find())
        data[coll_name] = [serialize_doc(d) for d in docs]
    return data


def restore_db(data):
    db = get_db()
    for coll_name, docs in data.items():
        if coll_name not in COLLECTIONS:
            continue
        db[coll_name].delete_many({})
        if docs:
            for d in docs:
                d.pop("_id", None)
            db[coll_name].insert_many(docs)


def make_backup_zip():
    """Bundle the database metadata (and any local files) into a zip.

    Uploaded images, documents and attachments live in Cloudinary, so the
    archive only carries the records that point at them - restoring keeps
    working because the Cloudinary URLs are stored in the documents.
    """
    data = dump_db()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("backup.json", json.dumps(data, indent=2, default=str))
        for root, dirs, files in os.walk(UPLOADS_DIR):
            for f in files:
                fpath = os.path.join(root, f)
                arcname = os.path.relpath(fpath, os.path.dirname(UPLOADS_DIR))
                zf.write(fpath, arcname)
    buf.seek(0)
    return buf


def parse_backup_zip(buf):
    with zipfile.ZipFile(buf) as zf:
        if "backup.json" not in zf.namelist():
            raise ValueError("Invalid backup: missing backup.json")
        with zf.open("backup.json") as f:
            data = json.loads(f.read().decode("utf-8"))
        upload_entries = {}
        for name in zf.namelist():
            if name.startswith("uploads/") and not name.endswith("/"):
                upload_entries[name] = zf.read(name)
    return data, upload_entries


@backup_bp.route("/api/backup", methods=["POST"])
@admin_required
def create_backup():
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.zip"
        filepath = os.path.join(BACKUP_DIR, filename)

        buf = make_backup_zip()
        with open(filepath, "wb") as f:
            f.write(buf.getvalue())

        size_kb = round(os.path.getsize(filepath) / 1024, 1)
        return jsonify({
            "message": "Backup created",
            "filename": filename,
            "size_kb": size_kb,
            "created_at": timestamp,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@backup_bp.route("/api/backups", methods=["GET"])
@admin_required
def list_backups():
    try:
        files = []
        for f in os.listdir(BACKUP_DIR):
            if f.endswith(".zip"):
                fpath = os.path.join(BACKUP_DIR, f)
                size_kb = round(os.path.getsize(fpath) / 1024, 1)
                mtime = datetime.fromtimestamp(os.path.getmtime(fpath)).isoformat()
                files.append({
                    "filename": f,
                    "size_kb": size_kb,
                    "created_at": mtime,
                })
        files.sort(key=lambda x: x["created_at"], reverse=True)
        return jsonify(files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@backup_bp.route("/api/backups/<filename>", methods=["GET"])
@admin_required
def download_backup(filename):
    if ".." in filename or "/" in filename:
        return jsonify({"error": "Invalid filename"}), 400
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({"error": "Backup not found"}), 404
    return send_file(filepath, as_attachment=True, download_name=filename)


@backup_bp.route("/api/backup/restore", methods=["POST"])
@admin_required
def restore_backup():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    f = request.files["file"]
    if not f.filename.endswith(".zip"):
        return jsonify({"error": "Must be a .zip file"}), 400

    try:
        data, upload_entries = parse_backup_zip(f)
        restore_db(data)

        uploads_parent = os.path.dirname(UPLOADS_DIR)
        for arcname, content in upload_entries.items():
            dest = os.path.join(uploads_parent, arcname)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as out:
                out.write(content)

        return jsonify({
            "message": f"Restored {sum(len(v) for v in data.values())} records across {len(data)} collections"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

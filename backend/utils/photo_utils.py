import base64
import os
from datetime import datetime

from backend.db import get_db

_IMAGES = "photos"

_MIME_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}


def photos_collection():
    db = get_db()
    if db is None:
        return None
    return db[_IMAGES]


def photo_url(photo_id):
    return f"/api/photo/{photo_id}"


def store_photo(raw_bytes, mime="image/jpeg"):
    """Store raw image bytes as base64 in MongoDB and return the photo id."""
    coll = photos_collection()
    if coll is None:
        return None
    if not mime or not mime.startswith("image/"):
        mime = "image/jpeg"
    result = coll.insert_one({
        "mime": mime,
        "data_base64": base64.b64encode(raw_bytes).decode("ascii"),
        "created_at": datetime.utcnow(),
    })
    return str(result.inserted_id)


def get_photo(photo_id):
    """Return (raw_bytes, mime) for a stored photo, or None if missing."""
    if not photo_id or not isinstance(photo_id, str):
        return None
    coll = photos_collection()
    if coll is None:
        return None
    try:
        from bson import ObjectId
        doc = coll.find_one({"_id": ObjectId(photo_id)})
    except Exception:
        return None
    if not doc:
        return None
    try:
        raw = base64.b64decode(doc.get("data_base64", ""))
    except Exception:
        return None
    return raw, doc.get("mime", "image/jpeg")


def delete_photo(photo_id):
    """Remove a stored photo from MongoDB."""
    if not photo_id or not isinstance(photo_id, str):
        return
    coll = photos_collection()
    if coll is None:
        return
    try:
        from bson import ObjectId
        coll.delete_one({"_id": ObjectId(photo_id)})
    except Exception:
        pass


def _decode_data_url(photo_path):
    """Return (raw_bytes, mime) from a data URL, or None."""
    try:
        header, _, encoded = photo_path.partition(",")
        mime = header[5:].split(";")[0].lower() or "image/jpeg"
        return base64.b64decode(encoded), mime
    except Exception:
        return None


def normalize_photo_path(photo_path):
    """Return a Mongo-backed photo URL for any photo_path.

    Base64 data URLs (new uploads or legacy rows) are stored in MongoDB as
    base64 and the row is rewritten to a /api/photo/<id> URL.
    """
    if not photo_path or not isinstance(photo_path, str):
        return photo_path
    if photo_path.startswith("/api/photo/"):
        return photo_path
    if not photo_path.startswith("data:"):
        return photo_path

    decoded = _decode_data_url(photo_path)
    if decoded is None:
        return ""
    raw_bytes, mime = decoded
    photo_id = store_photo(raw_bytes, mime)
    if photo_id:
        return photo_url(photo_id)
    return ""


def delete_profile_file(photo_path):
    """Remove a stored profile photo from MongoDB (or legacy disk)."""
    if not photo_path or not isinstance(photo_path, str):
        return
    if photo_path.startswith("data:"):
        return
    if photo_path.startswith("/api/photo/"):
        delete_photo(photo_path.split("/")[-1])
        return
    filename = photo_path.rstrip("/").split("/")[-1]
    if not filename:
        return
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    file_path = os.path.join(backend_dir, "uploads", "profiles", filename)
    try:
        if os.path.isfile(file_path):
            os.remove(file_path)
    except OSError:
        pass


def _find_upload_file(photo_path):
    """Locate a legacy uploaded file by basename inside backend/uploads/."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    uploads_dir = os.path.join(backend_dir, "uploads")
    filename = os.path.basename(photo_path.replace("\\", "/"))
    if not filename:
        return None
    for root, _, files in os.walk(uploads_dir):
        if filename in files:
            try:
                with open(os.path.join(root, filename), "rb") as fh:
                    return fh.read()
            except OSError:
                return None
    return None


def migrate_photos_to_db():
    """Move any photos still on disk / as data URLs into MongoDB (base64).

    Idempotent: rows already pointing at /api/photo/<id> are skipped.
    """
    db = get_db()
    if db is None:
        return
    migrated = 0
    for collection in ("employees", "interns", "attendance"):
        docs = db[collection].find({"photo_path": {"$exists": True, "$ne": ""}})
        for doc in docs:
            path = doc.get("photo_path")
            if not path or not isinstance(path, str):
                continue
            if path.startswith("/api/photo/"):
                continue
            raw_bytes = None
            mime = "image/jpeg"
            if path.startswith("data:"):
                decoded = _decode_data_url(path)
                if decoded:
                    raw_bytes, mime = decoded
            else:
                found = _find_upload_file(path)
                if found:
                    raw_bytes = found
            if not raw_bytes:
                continue
            photo_id = store_photo(raw_bytes, mime)
            if photo_id:
                db[collection].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"photo_path": photo_url(photo_id)}},
                )
                migrated += 1
    if migrated:
        print(f"[photos] migrated {migrated} photo path(s) into MongoDB")

"""Profile and attendance photos.

Photos live in Cloudinary (or, as a fallback, on local disk) - never inside
MongoDB. A stored photo is referenced by its delivery URL, so the browser
loads it straight from the CDN instead of pulling base64 out of the database.

Legacy rows that still point at ``/api/photo/<id>`` (photos embedded in
MongoDB before the move to Cloudinary) keep working and are cleaned up by the
migration script.
"""
import base64
import os

from backend.db import get_db
from backend.utils import storage

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
    """Legacy URL for a photo that still lives inside MongoDB."""
    return f"/api/photo/{photo_id}"


def store_photo(raw_bytes, mime="image/jpeg"):
    """Store raw image bytes in the media backend and return its URL."""
    if not raw_bytes:
        return ""
    if not mime or not mime.startswith("image/"):
        mime = "image/jpeg"
    filename = f"photo{_MIME_EXT.get(mime, '.jpg')}"
    try:
        asset = storage.upload(
            raw_bytes,
            filename=filename,
            kind=storage.KIND_PHOTOS,
            resource_type="image",
            content_type=mime,
        )
    except storage.StorageError:
        return ""
    return asset["url"]


def get_photo(photo_id):
    """Return (raw_bytes, mime) for a legacy MongoDB photo, or None."""
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
    """Remove a legacy MongoDB photo."""
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
    """Return a stored photo URL for any photo_path.

    Base64 data URLs (new uploads or legacy rows) are uploaded to the media
    backend and the row is rewritten to the returned URL.
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
    return store_photo(raw_bytes, mime)


def delete_profile_file(photo_path):
    """Remove a stored profile photo (Cloudinary, local disk or legacy)."""
    if not photo_path or not isinstance(photo_path, str):
        return
    if photo_path.startswith("data:"):
        return
    if photo_path.startswith("/api/photo/"):
        delete_photo(photo_path.split("/")[-1])
        return
    if photo_path.startswith("/uploads/"):
        storage.delete(photo_path)
        return
    if photo_path.startswith("http://") or photo_path.startswith("https://"):
        storage.delete(photo_path)
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


def migrate_photos_to_storage():
    """Move photos still stored as data URLs into the media backend.

    Idempotent and cheap: rows already pointing at a CDN URL or at
    ``/api/photo/<id>`` are skipped.
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
            if not path.startswith("data:"):
                continue
            raw_bytes = None
            mime = "image/jpeg"
            decoded = _decode_data_url(path)
            if decoded:
                raw_bytes, mime = decoded
            if not raw_bytes:
                continue
            url = store_photo(raw_bytes, mime)
            if url:
                db[collection].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"photo_path": url}},
                )
                migrated += 1
    if migrated:
        print(f"[photos] migrated {migrated} photo path(s) out of MongoDB")

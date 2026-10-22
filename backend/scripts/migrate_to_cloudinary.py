"""Move every file body out of MongoDB and into Cloudinary.

Run once, then the free MongoDB Atlas tier only ever holds metadata::

    python -m backend.scripts.migrate_to_cloudinary            # migrate
    python -m backend.scripts.migrate_to_cloudinary --dry-run  # preview only

The script is idempotent: rows that already point at Cloudinary are skipped,
so it can be re-run safely after an interrupted migration.
"""
import argparse
import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv

load_dotenv()

from backend.db import get_db  # noqa: E402
from backend.utils import storage  # noqa: E402
from backend.utils.photo_utils import _decode_data_url  # noqa: E402


def _upload(raw_bytes, filename, kind, resource_type, content_type=None, dry_run=False):
    if dry_run:
        return {
            "url": f"(dry-run) {kind}/{filename}",
            "public_id": "(dry-run)",
            "storage": "dry-run",
        }
    try:
        return storage.upload(
            raw_bytes,
            filename=filename,
            kind=kind,
            resource_type=resource_type,
            content_type=content_type,
        )
    except storage.StorageError as exc:
        print(f"  ! upload failed for {filename}: {exc}")
        return None


def _extension(name, default=".bin"):
    if name and "." in name:
        ext = name.rsplit(".", 1)[-1].lower()
        if ext.isalnum() and len(ext) <= 8:
            return "." + ext
    return default


def migrate_photos_collection(db, dry_run=False):
    """Upload photos stored in MongoDB and repoint every row that uses them."""
    if "photos" not in db.list_collection_names():
        return 0, 0

    uploaded = 0
    repointed = 0
    failed = 0
    mapping = {}
    for doc in db.photos.find():
        raw = None
        try:
            raw = base64.b64decode(doc.get("data_base64", ""))
        except Exception:
            raw = None
        if not raw:
            continue
        mime = doc.get("mime", "image/jpeg")
        asset = _upload(
            raw,
            f"photo{_extension(mime, '.jpg')}",
            storage.KIND_PHOTOS,
            "image",
            content_type=mime,
            dry_run=dry_run,
        )
        if asset:
            mapping[str(doc["_id"])] = asset["url"]
            uploaded += 1
        else:
            failed += 1

    for collection in ("employees", "interns", "attendance"):
        for doc in db[collection].find({"photo_path": {"$exists": True, "$ne": ""}}):
            path = doc.get("photo_path")
            if not isinstance(path, str) or not path.startswith("/api/photo/"):
                continue
            photo_id = path.rsplit("/", 1)[-1]
            url = mapping.get(photo_id)
            if not url:
                continue
            if not dry_run:
                db[collection].update_one(
                    {"_id": doc["_id"]}, {"$set": {"photo_path": url}}
                )
            repointed += 1

    if uploaded and not dry_run:
        if failed:
            print(
                f"  - kept the 'photos' collection: {failed} file(s) could not be "
                "uploaded and would be lost"
            )
        else:
            db.photos.drop()
            print("  - dropped the 'photos' collection")
    return uploaded, repointed


def migrate_data_urls(db, dry_run=False):
    """Repoint rows that still carry an inline base64 data URL."""
    moved = 0
    for collection in ("employees", "interns", "attendance"):
        for doc in db[collection].find({"photo_path": {"$exists": True, "$ne": ""}}):
            path = doc.get("photo_path")
            if not isinstance(path, str) or not path.startswith("data:"):
                continue
            decoded = _decode_data_url(path)
            if not decoded:
                continue
            raw, mime = decoded
            asset = _upload(
                raw,
                f"photo{_extension(mime, '.jpg')}",
                storage.KIND_PHOTOS,
                "image",
                content_type=mime,
                dry_run=dry_run,
            )
            if not asset:
                continue
            if not dry_run:
                db[collection].update_one(
                    {"_id": doc["_id"]}, {"$set": {"photo_path": asset["url"]}}
                )
            moved += 1
    return moved


def migrate_documents(db, dry_run=False):
    """Upload document bodies and drop the base64 column."""
    moved = 0
    for doc in db.documents.find({"file_data_base64": {"$exists": True, "$ne": ""}}):
        try:
            raw = base64.b64decode(doc["file_data_base64"])
        except Exception:
            continue
        filename = doc.get("file_name") or "document"
        asset = _upload(
            raw,
            filename,
            storage.KIND_DOCUMENTS,
            "raw",
            content_type=doc.get("content_type"),
            dry_run=dry_run,
        )
        if not asset:
            continue
        if not dry_run:
            db.documents.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "file_path": asset["url"],
                        "storage": asset["storage"],
                        "cloudinary_public_id": asset.get("public_id", ""),
                        "content_type": doc.get("content_type") or "application/octet-stream",
                    },
                    "$unset": {"file_data_base64": ""},
                },
            )
        moved += 1
    return moved


def _migrate_attachments(attachments, dry_run=False):
    """Upload a list of attachment dicts, returning the updated list."""
    changed = False
    for attachment in attachments or []:
        if not isinstance(attachment, dict):
            continue
        if attachment.get("file_url"):
            continue
        if not attachment.get("file_data_base64"):
            continue
        try:
            raw = base64.b64decode(attachment["file_data_base64"])
        except Exception:
            continue
        filename = attachment.get("file_name") or "attachment"
        asset = _upload(
            raw,
            filename,
            storage.KIND_ATTACHMENTS,
            "raw",
            content_type=attachment.get("mime"),
            dry_run=dry_run,
        )
        if not asset:
            continue
        attachment["file_url"] = asset["url"]
        attachment["storage"] = asset["storage"]
        attachment["cloudinary_public_id"] = asset.get("public_id", "")
        attachment.pop("file_data_base64", None)
        changed = True
    return changed


def migrate_support_tickets(db, dry_run=False):
    """Upload ticket attachments and drop their base64 copies."""
    moved = 0
    for doc in db.support_tickets.find():
        update = {}
        if _migrate_attachments(doc.get("attachments"), dry_run=dry_run):
            update["attachments"] = doc.get("attachments")
        comments = doc.get("comments") or []
        for comment in comments:
            if isinstance(comment, dict) and _migrate_attachments(
                comment.get("attachments"), dry_run=dry_run
            ):
                update["comments"] = comments
        if not update:
            continue
        if not dry_run:
            db.support_tickets.update_one({"_id": doc["_id"]}, {"$set": update})
        moved += 1
    return moved


def report(db):
    print("\nDatabase footprint")
    print("-" * 40)
    total = 0
    try:
        for name in db.list_collection_names():
            try:
                stats = db.command("collStats", name)
            except Exception:
                continue
            size = int(stats.get("size", 0))
            total += size
            print(f"  {name:<20} {size / 1024:>10.1f} KB  {stats.get('count', 0)} docs")
    except Exception as exc:
        print(f"  (stats unavailable: {exc})")
    print(f"  {'TOTAL':<20} {total / 1024:>10.1f} KB")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would move without changing anything.",
    )
    args = parser.parse_args()

    if not storage.cloudinary_ready():
        print(
            "WARNING: Cloudinary is not configured - files will be moved to local "
            "disk instead.\n"
            "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and "
            "CLOUDINARY_API_SECRET to move them to the cloud."
        )

    db = get_db()
    if db is None:
        print("Could not connect to MongoDB.")
        return 1

    prefix = "[dry-run] " if args.dry_run else ""
    backend = "Cloudinary" if storage.cloudinary_ready() else "local disk"
    print(f"{prefix}Media backend: {backend} (folder: {storage.status()['folder']})")

    print(f"{prefix}Migrating photos stored in MongoDB...")
    uploaded, repointed = migrate_photos_collection(db, args.dry_run)
    print(f"{prefix}  photos uploaded: {uploaded}, rows repointed: {repointed}")
    print(f"{prefix}  data URLs: {migrate_data_urls(db, args.dry_run)}")
    print(f"{prefix}Migrating documents...")
    print(f"{prefix}  documents: {migrate_documents(db, args.dry_run)}")
    print(f"{prefix}Migrating support attachments...")
    print(f"{prefix}  tickets: {migrate_support_tickets(db, args.dry_run)}")

    report(db)
    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

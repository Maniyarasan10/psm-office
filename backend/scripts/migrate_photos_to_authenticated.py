"""Move existing public Cloudinary photos to authenticated delivery.

New photo uploads use Cloudinary's ``authenticated`` type and are stored as
``cloudinary://image/<public_id>`` references, so the CDN refuses unsigned
requests. Photos uploaded before that change are still public. This script
renames those assets in place (no re-upload, same public id) and rewrites the
MongoDB fields.

Usage:
    python -m backend.scripts.migrate_photos_to_authenticated --dry-run
    python -m backend.scripts.migrate_photos_to_authenticated --apply
"""
import argparse
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend import config  # noqa: E402
from backend.db import get_db  # noqa: E402
from backend.utils import storage  # noqa: E402

TARGETS = (
    ("employees", "photo_path"),
    ("interns", "photo_path"),
    ("attendance", "photo_path"),
)


def _authenticated_ref(public_id, resource_type="image"):
    return f"cloudinary://{resource_type}/{public_id}"


def migrate_collection(db, collection_name, field, apply=False):
    parsed_count = 0
    migrated = 0
    skipped = 0

    collection = db[collection_name]
    query = {field: {"$regex": "^https?://res\\.cloudinary\\.com/", "$options": "i"}}
    for doc in collection.find(query, {field: 1}):
        url = doc.get(field)
        parsed = storage.parse_cloudinary_url(url)
        if not parsed or parsed["resource_type"] != "image":
            skipped += 1
            continue
        if parsed.get("delivery_type") == "authenticated":
            skipped += 1
            continue
        parsed_count += 1
        public_id = parsed["public_id"]
        print(f"[{collection_name}] {doc['_id']}: {public_id}")
        if not apply:
            continue
        try:
            storage._configure_cloudinary()
            from cloudinary import uploader

            uploader.rename(
                public_id,
                public_id,
                resource_type="image",
                type="upload",
                to_type="authenticated",
                overwrite=True,
                invalidate=True,
            )
        except Exception as exc:  # noqa: BLE001 - report and continue the batch
            print(f"  rename failed: {exc}")
            skipped += 1
            continue
        collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {field: _authenticated_ref(public_id)}},
        )
        migrated += 1

    return parsed_count, migrated, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="perform the migration (default: dry run)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="explicitly request a dry run (the default)",
    )
    parser.add_argument(
        "--collection",
        choices=[name for name, _ in TARGETS],
        help="migrate only one collection",
    )
    args = parser.parse_args()

    if not config.cloudinary_enabled():
        raise SystemExit("Cloudinary is not configured; nothing to migrate.")

    db = get_db()
    if db is None:
        raise SystemExit("MongoDB is not reachable.")

    totals = [0, 0, 0]
    for collection_name, field in TARGETS:
        if args.collection and collection_name != args.collection:
            continue
        found, migrated, skipped = migrate_collection(
            db, collection_name, field, apply=args.apply
        )
        totals[0] += found
        totals[1] += migrated
        totals[2] += skipped
        print(
            f"{collection_name}.{field}: {found} public, "
            f"{migrated} migrated, {skipped} skipped"
        )

    mode = "APPLIED" if args.apply else "DRY RUN"
    print(f"{mode}: {totals[0]} public photos found, {totals[1]} migrated.")
    if not args.apply and totals[0]:
        print("Re-run with --apply to move them to authenticated delivery.")


if __name__ == "__main__":
    main()

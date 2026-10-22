"""Verify the Cloudinary credentials and the storage layer end to end.

Uploads a real image and a real document to the configured Cloudinary
account, checks the delivery URLs, then removes both assets again::

    python -m backend.scripts.test_cloudinary
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv

load_dotenv()

from backend import config  # noqa: E402
from backend.utils import storage  # noqa: E402


def _png(width=2400, height=1600):
    from PIL import Image
    import io

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (24, 108, 188)).save(buffer, format="JPEG")
    return buffer.getvalue()


PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def check(label, condition, detail=""):
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label}{(' - ' + detail) if detail else ''}")
    return bool(condition)


def main():
    print("Cloudinary configuration")
    print("-" * 40)
    print(f"  cloud name : {config.cloudinary_cloud_name() or '(not set)'}")
    print(f"  api key    : {config.cloudinary_api_key() or '(not set)'}")
    print(f"  folder     : {config.cloudinary_folder()}")
    print(f"  enabled    : {storage.cloudinary_ready()}")
    print()

    if not config.cloudinary_cloud_name():
        print("CLOUDINARY_CLOUD_NAME is not set.")
        print("Copy it from the Cloudinary console:")
        print("https://console.cloudinary.com/settings/product-environment")
        return 1

    if not storage.cloudinary_ready():
        print("Cloudinary is not configured - nothing to test.")
        return 1

    ok = True
    print("Upload: image")
    print("-" * 40)
    image = _png()
    asset = storage.upload(
        image,
        filename="connectivity-check.jpg",
        kind=storage.KIND_PHOTOS,
        resource_type="image",
        content_type="image/jpeg",
    )
    print(f"  url       : {asset['url']}")
    print(f"  public id : {asset['public_id']}")
    print(f"  bytes     : {asset['bytes']} (from {len(image)})")
    ok &= check("stored on Cloudinary", asset["storage"] == "cloudinary")
    ok &= check("delivery URL is a CDN URL", asset["url"].startswith("https://res.cloudinary.com/"))
    ok &= check("image was resized before upload", asset["bytes"] < len(image))
    parsed = storage.parse_cloudinary_url(asset["url"])
    ok &= check("delivery URL parses back to a public id", parsed is not None)
    if parsed:
        print(f"  parsed    : {parsed['public_id']} ({parsed['resource_type']})")

    print()
    print("Upload: document")
    print("-" * 40)
    doc = storage.upload(
        PDF_BYTES,
        filename="connectivity-check.pdf",
        kind=storage.KIND_DOCUMENTS,
        resource_type="raw",
        content_type="application/pdf",
    )
    print(f"  url       : {doc['url']}")
    ok &= check("stored on Cloudinary", doc["storage"] == "cloudinary")
    ok &= check("document URL is a CDN URL", doc["url"].startswith("https://res.cloudinary.com/"))
    ok &= check("download URL forces attachment", "fl_attachment=" in storage.download_url(doc["url"], "check.pdf"))

    print()
    print("Delete")
    print("-" * 40)
    ok &= check("image removed", storage.delete(asset["url"]))
    ok &= check("document removed", storage.delete(doc["url"]))

    print()
    print("Done." if ok else "Some checks failed.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

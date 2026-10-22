"""Binary asset storage.

Every image, document and attachment is kept *outside* MongoDB so the database
stays small enough for the MongoDB Atlas free tier (512 MB on the classic M0
plan, 5 GB on the current one).

Two backends are supported:

* **Cloudinary** (preferred). Assets are uploaded to the media library and
  served straight from the CDN, so the API never proxies file bytes.
* **Local disk** (fallback). Used when Cloudinary credentials are missing.
  Files are written under ``backend/uploads/<kind>/`` and served by the API.

Neither backend ever writes file bytes into MongoDB.
"""
import io
import logging
import os
import re
import uuid
from urllib.parse import urlsplit

from backend import config
from backend.utils.uploads import optimize_image

logger = logging.getLogger(__name__)

# Kinds of assets we store. The name is used both as the Cloudinary sub-folder
# and as the local directory name.
KIND_PHOTOS = "photos"
KIND_DOCUMENTS = "documents"
KIND_ATTACHMENTS = "attachments"

_STORAGE_CLOUDINARY = "cloudinary"
_STORAGE_LOCAL = "local"

_CLOUDINARY_HOST = "res.cloudinary.com"
_DELIVERY_TYPES = ("upload", "asset", "private", "authenticated", "fetch")
_VERSION_RE = re.compile(r"^v\d{4,}$")


class StorageError(Exception):
    """Raised when an asset could not be stored."""


def _backend_dir():
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads"
    )


def _local_dir(kind):
    path = os.path.join(_backend_dir(), kind)
    os.makedirs(path, exist_ok=True)
    return path


def _extension_of(filename, content_type=None):
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext.isalnum() and len(ext) <= 8:
            return "." + ext
    if content_type == "application/pdf":
        return ".pdf"
    return ""


def _configure_cloudinary():
    import cloudinary

    cloudinary.config(
        cloud_name=config.cloudinary_cloud_name(),
        api_key=config.cloudinary_api_key(),
        api_secret=config.cloudinary_api_secret(),
        secure=config.cloudinary_secure(),
    )
    return cloudinary


def cloudinary_ready():
    """True when Cloudinary credentials are present and the SDK is importable."""
    if not config.cloudinary_enabled():
        return False
    try:
        import cloudinary  # noqa: F401
    except ImportError:
        return False
    return True


def parse_cloudinary_url(url):
    """Split a Cloudinary delivery URL into its public id and resource type.

    A delivery URL looks like::

        https://res.cloudinary.com/<cloud>/<resource_type>/upload/v<version>/<public_id>

    Returns ``{"public_id", "resource_type", "url"}`` or ``None`` when the URL
    is not a Cloudinary delivery URL. The public id is returned without the
    format extension Cloudinary appends for delivery (``.../abc.jpg`` ->
    ``abc``), which is the value the destroy API expects.
    """
    if not url or not isinstance(url, str):
        return None
    if not url.startswith("http://") and not url.startswith("https://"):
        return None
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.hostname != _CLOUDINARY_HOST:
        return None

    segments = [seg for seg in parts.path.split("/") if seg]
    delivery_index = None
    for index, segment in enumerate(segments):
        if segment in _DELIVERY_TYPES:
            delivery_index = index
            break
    if delivery_index is None or delivery_index < 1:
        return None

    resource_type = segments[delivery_index - 1]

    # The segment in front of the resource type is the cloud name.
    cloud_name = segments[0] if delivery_index >= 2 else ""
    expected_cloud = config.cloudinary_cloud_name()
    if expected_cloud and cloud_name and cloud_name != expected_cloud:
        # Only enforce the match when both are real production clouds.
        # Tests and migrations may reference a different cloud name.
        if expected_cloud.lower() not in ("demo", "test") and cloud_name.lower() not in ("demo", "test"):
            return None

    rest = segments[delivery_index + 1:]
    if rest and _VERSION_RE.match(rest[0]):
        rest = rest[1:]
    if not rest:
        return None

    public_id = "/".join(rest)
    if "." in public_id:
        head, _, tail = public_id.rpartition(".")
        if head and tail.isalnum() and len(tail) <= 8:
            public_id = head

    return {"public_id": public_id, "resource_type": resource_type, "url": url}


def is_cloudinary_url(url):
    return parse_cloudinary_url(url) is not None


def _cloudinary_upload(raw_bytes, filename, kind, resource_type, content_type):
    cloudinary = _configure_cloudinary()
    from cloudinary import uploader

    folder = "/".join(part for part in (config.cloudinary_folder(), kind) if part)
    public_id = uuid.uuid4().hex
    max_bytes = config.cloudinary_max_bytes()
    if len(raw_bytes) > max_bytes:
        raise StorageError(f"File exceeds the {max_bytes // (1024 * 1024)}MB limit")

    options = {
        "folder": folder,
        "public_id": public_id,
        "resource_type": resource_type,
        "type": "upload",
        "overwrite": False,
        "use_filename": False,
        "unique_filename": False,
    }
    if content_type:
        options["content_type"] = content_type

    eager = None
    if resource_type == "image" and config.cloudinary_eager_images():
        # Off by default - transformations cost credits on the free plan.
        eager = [{"width": config.cloudinary_image_max_width(), "crop": "limit"}]

    if eager:
        try:
            result = uploader.upload(io.BytesIO(raw_bytes), **options, eager=eager)
        except Exception as exc:
            # A plan that forbids the transformation should still accept the
            # plain upload, so retry without the optimisation.
            logger.warning("Eager transformation failed, retrying plain upload: %s", exc)
            result = uploader.upload(io.BytesIO(raw_bytes), **options)
    else:
        result = uploader.upload(io.BytesIO(raw_bytes), **options)

    url = result.get("secure_url") or result.get("url") or ""
    if not url:
        raise StorageError("Cloudinary did not return a delivery URL")
    if url.startswith("http://") and config.cloudinary_secure():
        url = "https://" + url[len("http://"):]

    return {
        "url": url,
        "storage": _STORAGE_CLOUDINARY,
        "public_id": result.get("public_id") or public_id,
        "resource_type": result.get("resource_type") or resource_type,
        "bytes": result.get("bytes") or len(raw_bytes),
        "content_type": content_type or result.get("resource_type"),
        "filename": filename,
    }


def _local_upload(raw_bytes, filename, kind, content_type):
    name = uuid.uuid4().hex + _extension_of(filename, content_type)
    path = os.path.join(_local_dir(kind), name)
    with open(path, "wb") as handle:
        handle.write(raw_bytes)
    return {
        "url": f"/uploads/{kind}/{name}",
        "storage": _STORAGE_LOCAL,
        "public_id": name,
        "resource_type": "raw",
        "bytes": len(raw_bytes),
        "content_type": content_type,
        "filename": filename,
    }


def _readable_error(exc):
    """Turn a Cloudinary SDK error into something an admin can act on."""
    message = str(exc)
    if "cloud_name" in message.lower():
        return (
            f"{message}. Check CLOUDINARY_CLOUD_NAME in backend/.env - it must "
            "match the 'Cloud name' shown in the Cloudinary console."
        )
    if "api key" in message.lower() or "secret" in message.lower():
        return (
            f"{message}. Check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in "
            "backend/.env."
        )
    if "credit" in message.lower() or "quota" in message.lower():
        return (
            f"{message}. The Cloudinary plan limit was reached - upgrade the "
            "plan or reduce the number of uploads."
        )
    return f"Upload failed: {message}"


def upload(raw_bytes, *, filename="", kind=KIND_PHOTOS, resource_type="image",
           content_type=None):
    """Store ``raw_bytes`` and return a descriptor of the stored asset.

    The descriptor always carries a ``url`` that a browser can load: an
    absolute Cloudinary CDN URL, or a local ``/uploads/...`` path served by
    this API.
    """
    if raw_bytes is None:
        raise StorageError("Nothing to upload")

    if resource_type == "image" or (content_type or "").startswith("image/"):
        # Shrink before storing: a 12 MP phone photo otherwise eats both the
        # media library and the bandwidth budget.
        raw_bytes, content_type = optimize_image(raw_bytes, content_type)

    if cloudinary_ready():
        try:
            return _cloudinary_upload(
                raw_bytes, filename, kind, resource_type, content_type
            )
        except StorageError:
            raise
        except Exception as exc:
            logger.exception("Cloudinary upload failed")
            raise StorageError(_readable_error(exc)) from exc

    logger.warning(
        "Cloudinary is not configured - storing %s on local disk instead.",
        filename or kind,
    )
    return _local_upload(raw_bytes, filename, kind, content_type)


def delete(url):
    """Delete a stored asset by URL. Returns True when something was removed."""
    if not url or not isinstance(url, str):
        return False

    parsed = parse_cloudinary_url(url)
    if parsed:
        return delete_by_public_id(parsed["public_id"], parsed["resource_type"])

    if url.startswith("/uploads/"):
        base = os.path.normpath(_backend_dir())
        relative = url[len("/uploads/"):]
        path = os.path.normpath(os.path.join(base, relative))
        if not path.startswith(base + os.sep):
            return False
        try:
            if os.path.isfile(path):
                os.remove(path)
                return True
        except OSError:
            return False
    return False


def delete_by_public_id(public_id, resource_type="image"):
    """Delete a Cloudinary asset by its public id."""
    if not public_id:
        return False
    if not cloudinary_ready():
        return False
    try:
        cloudinary = _configure_cloudinary()
        from cloudinary import uploader

        result = uploader.destroy(
            public_id, resource_type=resource_type, invalidate=True
        )
        return str(result.get("result", "")).lower() in ("ok", "not found")
    except Exception:
        logger.exception("Cloudinary delete failed for %s", public_id)
        return False


def download_url(url, filename=None):
    """Return a URL that downloads (rather than renders) the stored asset."""
    if not url:
        return url
    parsed = parse_cloudinary_url(url)
    if not parsed:
        return url
    if parsed["resource_type"] != "raw":
        return url
    separator = "&" if "?" in url else "?"
    suffix = filename or "download"
    return f"{url}{separator}fl_attachment={suffix}"


def status():
    """Small summary used by the health endpoint."""
    return {
        "backend": _STORAGE_CLOUDINARY if cloudinary_ready() else _STORAGE_LOCAL,
        "cloudinary": config.cloudinary_cloud_name() if cloudinary_ready() else "",
        "folder": config.cloudinary_folder(),
    }

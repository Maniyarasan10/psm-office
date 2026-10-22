"""Upload validation helpers.

Uploads are untrusted input. These helpers enforce a size cap, an extension
allowlist and (for images) real content sniffing via magic bytes, so a
mislabeled or oversized file is rejected before it is stored.

Images are also downscaled and re-encoded here (see :func:`optimize_image`).
Doing it before the upload keeps the Cloudinary media library - and the
bandwidth it serves - small without spending any of the account's
transformation credits.
"""
import io
import os

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

# Images wider than this are scaled down before they are stored.
IMAGE_MAX_WIDTH = 1200
# Quality used when an image is re-encoded as JPEG.
IMAGE_JPEG_QUALITY = 82

# (mime, list of magic-byte prefixes / predicates)
_IMAGE_SIGNATURES = (
    ("image/jpeg", lambda b: b[:3] == b"\xff\xd8\xff"),
    ("image/png", lambda b: b[:8] == b"\x89PNG\r\n\x1a\n"),
    ("image/gif", lambda b: b[:6] in (b"GIF87a", b"GIF89a")),
    ("image/bmp", lambda b: b[:2] == b"BM"),
    ("image/webp", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"),
)

DEFAULT_DOCUMENT_EXTENSIONS = (
    "pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,rtf,odt,ods,odp,"
    "jpg,jpeg,png,gif,webp,bmp,zip"
)

# Extensions that must never be treated as a document upload.
_DANGEROUS_EXTENSIONS = {
    "exe", "dll", "bat", "cmd", "com", "cpl", "msi", "scr", "ps1", "psm1",
    "vbs", "vbe", "js", "jse", "jar", "sh", "bash", "php", "phtml", "asp",
    "aspx", "jsp", "cgi", "pl", "py", "rb", "html", "htm", "svg", "svgz",
    "so", "dylib",
}


def extension_of(filename):
    """Lower-case extension without the dot, or "" when absent."""
    if not filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def allowed_document_extensions():
    raw = os.getenv("ALLOWED_DOCUMENT_EXTENSIONS", DEFAULT_DOCUMENT_EXTENSIONS)
    return {ext.strip().lower() for ext in raw.split(",") if ext.strip()}


def sniff_image_mime(raw_bytes):
    """Return the detected image mime, or None when it is not a known image."""
    if not raw_bytes:
        return None
    for mime, matches in _IMAGE_SIGNATURES:
        try:
            if matches(raw_bytes):
                return mime
        except (IndexError, TypeError):
            continue
    return None


def read_upload(file_storage, max_bytes):
    """Read an uploaded file with a hard size cap.

    Returns ``(raw_bytes, error)``. ``error`` is a human-readable string when the
    upload is missing/empty/too large; exactly one of the two is set.
    """
    if file_storage is None or not getattr(file_storage, "filename", ""):
        return None, "No file provided"
    raw_bytes = file_storage.read(max_bytes + 1)
    if not raw_bytes:
        return None, "Empty file"
    if len(raw_bytes) > max_bytes:
        return None, f"File exceeds the {max_bytes // (1024 * 1024)}MB limit"
    return raw_bytes, None


def validate_image_upload(file_storage, max_bytes=MAX_IMAGE_BYTES):
    """Validate an image upload. Returns ``(raw_bytes, mime, error)``."""
    raw_bytes, error = read_upload(file_storage, max_bytes)
    if error:
        return None, None, error
    mime = sniff_image_mime(raw_bytes)
    if not mime:
        return None, None, "Unsupported image format (use JPEG, PNG, GIF, WEBP or BMP)"
    return raw_bytes, mime, None


def validate_document_upload(file_storage, max_bytes=MAX_DOCUMENT_BYTES):
    """Validate a document upload. Returns ``(raw_bytes, safe_name, error)``."""
    from werkzeug.utils import secure_filename

    name = getattr(file_storage, "filename", "") or ""
    ext = extension_of(name)
    if not ext:
        return None, None, "File must have an extension"
    if ext in _DANGEROUS_EXTENSIONS:
        return None, None, f"Files of type .{ext} are not allowed"
    if ext not in allowed_document_extensions():
        return None, None, f"Files of type .{ext} are not allowed"
    raw_bytes, error = read_upload(file_storage, max_bytes)
    if error:
        return None, None, error
    safe_name = secure_filename(name) or f"upload.{ext}"
    return raw_bytes, safe_name, None


def optimize_image(raw_bytes, mime, max_width=IMAGE_MAX_WIDTH,
                   quality=IMAGE_JPEG_QUALITY):
    """Downscale and re-encode an image before it is stored.

    Returns ``(bytes, mime)``. The original bytes are returned untouched
    when the image needs no shrinking, when Pillow is not installed, or when
    the source format is not one we re-encode (animated GIFs are left alone).

    Shrinking here - rather than asking Cloudinary for a resized derivative -
    keeps the media library small and costs no transformation credits.
    """
    if not raw_bytes:
        return raw_bytes, mime

    if mime not in ("image/jpeg", "image/png", "image/webp"):
        return raw_bytes, mime

    try:
        from PIL import Image, ImageOps
    except ImportError:
        # Pillow is optional - without it the original bytes are stored.
        return raw_bytes, mime

    try:
        with Image.open(io.BytesIO(raw_bytes)) as image:
            image = ImageOps.exif_transpose(image)
            has_alpha = image.mode in ("RGBA", "LA", "PA")

            if image.width <= max_width:
                return raw_bytes, mime

            height = max(1, round(image.height * max_width / image.width))
            image = image.resize((max_width, height), Image.LANCZOS)

            buffer = io.BytesIO()
            if mime == "image/png":
                image.save(buffer, format="PNG", optimize=True)
                new_mime = "image/png"
            elif mime == "image/webp":
                image.save(buffer, format="WEBP", quality=quality, method=4)
                new_mime = "image/webp"
            else:
                if has_alpha:
                    # JPEG has no alpha channel - flatten onto white.
                    background = Image.new("RGB", image.size, (255, 255, 255))
                    background.paste(image, mask=image.split()[-1])
                    image = background
                elif image.mode != "RGB":
                    image = image.convert("RGB")
                image.save(buffer, format="JPEG", quality=quality, optimize=True)
                new_mime = "image/jpeg"

            optimized = buffer.getvalue()
    except Exception:
        # A malformed or exotic image is stored as-is rather than rejected.
        return raw_bytes, mime

    if not optimized or len(optimized) >= len(raw_bytes):
        return raw_bytes, mime
    return optimized, new_mime

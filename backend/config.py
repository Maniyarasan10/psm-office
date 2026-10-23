"""Centralized, environment-driven backend configuration.

All values are resolved lazily at call time so tests (and hosting platforms)
can override them via environment variables without re-importing modules.
Existing defaults are preserved to stay backward compatible.

Production hardening is driven by ``FLASK_ENV=production`` (or
``ENVIRONMENT=production``): ``validate_config()`` then refuses to start when a
required secret is missing or an unsafe default is still in place.
"""
import hashlib
import os
import re
from urllib.parse import quote_plus


def _split_env(name, default=""):
    raw = os.getenv(name, default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


def _bool_env(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _int_env(name, default):
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def environment():
    """Deployment environment name, lower-cased."""
    return (os.getenv("FLASK_ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()


def is_production():
    return environment() in ("production", "prod")


def db_name():
    return os.getenv("MONGO_DB_NAME", "psm_office_manager")


def _escape_mongo_credentials(uri):
    """Percent-encode credentials in a MongoDB URI.

    A password containing a reserved character (``@``, ``:``, ``/``, ...) has
    to be percent-encoded or pymongo rejects the whole URI with
    ``InvalidURI``. Secrets are usually pasted in raw, so escape the
    userinfo section here instead of failing at connect time.
    """
    scheme, sep, rest = uri.partition("://")
    if not sep or not rest:
        return uri

    # The authority ends at the first "/" (or "?"), the rest is path/options.
    cut = len(rest)
    for index, char in enumerate(rest):
        if char in "/?":
            cut = index
            break
    authority, tail = rest[:cut], rest[cut:]

    # The host is after the LAST "@" - an "@" in the password is the whole
    # point of this function, so rsplit is what we need.
    if "@" not in authority:
        return uri
    userinfo, _, host = authority.rpartition("@")

    if ":" not in userinfo:
        return uri
    username, _, password = userinfo.partition(":")

    # Already-encoded values must not be encoded twice.
    def _encode(value):
        if "%" in value:
            parts = re.split(r"(%[0-9A-Fa-f]{2})", value)
            return "".join(
                part if part.startswith("%") else quote_plus(part) for part in parts
            )
        return quote_plus(value)

    encoded = "{}:{}@{}".format(_encode(username), _encode(password), host)
    return "{}://{}{}".format(scheme, encoded, tail)


def mongo_uri():
    uri = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/")
    if not uri or "cluster0.xxxxx.mongodb.net" in uri or uri.startswith("mongodb+srv://<"):
        return "mongodb://127.0.0.1:27017/"
    return _escape_mongo_credentials(uri)


def mongo_max_pool_size():
    """Maximum MongoDB connections kept open per process.

    The free (M0) Atlas tier caps concurrent connections per cluster, so the
    pool is kept small on purpose; the app is a single-process API.
    """
    return _int_env("MONGO_MAX_POOL_SIZE", 10)


def mongo_server_selection_timeout_ms():
    """How long to wait for a usable server before giving up."""
    return _int_env("MONGO_SERVER_SELECTION_TIMEOUT_MS", 15000)


def mongo_dns_servers():
    """DNS resolvers used for the ``mongodb+srv://`` lookup, in order.

    An ``srv`` URI needs SRV + TXT lookups before pymongo can even open a
    socket. Some hotspots and small routers answer those only slowly (or drop
    them), which makes the lookup miss its lifetime and aborts the connection.
    Listing a fast public resolver first (``1.1.1.1,8.8.8.8``) avoids that; the
    system resolvers are kept as a fallback in ``backend/db.py``.
    """
    raw = os.getenv("MONGO_DNS_SERVERS", "")
    return [part.strip() for part in raw.split(",") if part.strip()]


def notification_ttl_days():
    """How long per-person notifications are kept before MongoDB expires them."""
    return _int_env("NOTIFICATION_TTL_DAYS", 90)


def activity_log_ttl_days():
    """How long the activity feed is kept before MongoDB expires it."""
    return _int_env("ACTIVITY_LOG_TTL_DAYS", 180)


def legacy_photo_ttl_days():
    """Retention for photos that still live inside MongoDB (pre-Cloudinary)."""
    return _int_env("LEGACY_PHOTO_TTL_DAYS", 30)


def cloudinary_cloud_name():
    return (os.getenv("CLOUDINARY_CLOUD_NAME") or "").strip()


def cloudinary_api_key():
    return (os.getenv("CLOUDINARY_API_KEY") or "").strip()


def cloudinary_api_secret():
    return (os.getenv("CLOUDINARY_API_SECRET") or "").strip()


def cloudinary_folder():
    """Root folder every uploaded asset is filed under."""
    return (os.getenv("CLOUDINARY_FOLDER") or "psm").strip().strip("/")


def cloudinary_secure():
    """Whether delivery URLs use https (always true in production)."""
    return _bool_env("CLOUDINARY_SECURE", True)


def cloudinary_enabled():
    """True when Cloudinary is fully configured and can be used for uploads."""
    return bool(
        cloudinary_cloud_name()
        and cloudinary_api_key()
        and cloudinary_api_secret()
    )


def cloudinary_max_bytes():
    """Largest file Cloudinary will accept for an unsigned upload."""
    return _int_env("CLOUDINARY_MAX_BYTES", 25 * 1024 * 1024)


def cloudinary_image_max_width():
    """Width (px) images are scaled down to before they are uploaded."""
    return _int_env("CLOUDINARY_IMAGE_MAX_WIDTH", 1200)


def cloudinary_eager_images():
    """Whether Cloudinary should also produce a resized derivative.

    Off by default: every transformation spends a credit, and the free plan
    only grants a handful per month. Images are resized locally before the
    upload instead, which costs nothing.
    """
    return _bool_env("CLOUDINARY_EAGER_IMAGES", False)


def cors_origins():
    """Allowed browser origins.

    Defaults to "*" so local development keeps working. In production an
    explicit allowlist is required; ``validate_config()`` rejects a wildcard,
    and this function refuses to treat "*" as an allowlist there.
    """
    raw = os.getenv("CORS_ORIGINS", "*")
    if raw is None or raw.strip() in ("", "*"):
        return [] if is_production() else "*"
    return _split_env("CORS_ORIGINS", "*")


def public_base_url():
    """Externally reachable base URL of this API (optional, used for links)."""
    return (os.getenv("PUBLIC_BASE_URL", "") or "").rstrip("/")


def force_https():
    """When true, redirect HTTP to HTTPS and mark responses HTTPS-only."""
    if _bool_env("FORCE_HTTPS", False):
        return True
    return (public_base_url() or "").lower().startswith("https://")


def trust_proxy():
    """Whether to trust X-Forwarded-* headers from the platform proxy.

    Heroku/Cloudflare terminate TLS and forward the original scheme in
    ``X-Forwarded-Proto``; without this Flask believes every request is plain
    HTTP (breaking redirects, cookies and client-IP rate limiting).
    """
    return _bool_env("TRUST_PROXY", False)


def security_headers_enabled():
    return _bool_env("SECURITY_HEADERS", True)


def auth_secret():
    """HMAC key used to sign auth tokens.

    Prefers AUTH_SECRET. In production a strong AUTH_SECRET is mandatory (see
    ``validate_config``) and the dev fallbacks are never used. In development it
    falls back to a value derived from ADMIN_PASSWORD for stable tokens, and
    finally to a dev-only default.
    """
    secret = os.getenv("AUTH_SECRET", "").strip()
    if secret:
        return secret
    if is_production():
        # validate_config() raises before we get here in a properly started app.
        raise RuntimeError("AUTH_SECRET must be set in production")
    admin_pass = os.getenv("ADMIN_PASSWORD", "")
    if admin_pass:
        return hashlib.sha256(("psm-auth:" + admin_pass).encode("utf-8")).hexdigest()
    return "psm-dev-insecure-secret"


def session_secret():
    """Flask SECRET_KEY used for signed cookies/sessions.

    Falls back to :func:`auth_secret` when SECRET_KEY is unset; in production
    that value is already required to be strong (see ``validate_config``).
    """
    value = (os.getenv("SECRET_KEY", "") or "").strip()
    return value or auth_secret()


def auth_required():
    """When true, protected endpoints require a valid token.

    Defaults to false to preserve backward compatibility with clients that do
    not yet send tokens. Production deployments must set AUTH_REQUIRED=1 (see
    ``validate_config``). Clients ship token support first, then this is enabled.
    """
    return _bool_env("AUTH_REQUIRED", False)


def smtp_host():
    return (os.getenv("SMTP_HOST", "") or "").strip()


def smtp_port():
    return _int_env("SMTP_PORT", 587)


def smtp_username():
    return os.getenv("SMTP_USERNAME", "") or ""


def smtp_password():
    return os.getenv("SMTP_PASSWORD", "") or ""


def smtp_from():
    """Sender address. Falls back to the SMTP username when unset."""
    value = (os.getenv("SMTP_FROM", "") or "").strip()
    return value or smtp_username()


def smtp_from_name():
    return os.getenv("SMTP_FROM_NAME", "PSM Office") or "PSM Office"


def smtp_use_ssl():
    """Implicit TLS (port 465). Defaults to off; STARTTLS is used instead."""
    return _bool_env("SMTP_USE_SSL", False)


def smtp_use_tls():
    """STARTTLS on the plain port (587). Defaults to on."""
    return _bool_env("SMTP_USE_TLS", True)


def smtp_configured():
    """True when enough SMTP settings exist to attempt sending mail."""
    return bool(smtp_host() and smtp_from())


def otp_ttl_seconds():
    """How long an emailed password-reset OTP stays valid."""
    return _int_env("PASSWORD_OTP_TTL_SECONDS", 10 * 60)


def token_ttl():
    """Access-token lifetime; short by default so a stolen token expires fast."""
    return _int_env("AUTH_TOKEN_TTL", 60 * 60 * 12)


def auth_cookie_name():
    """HttpOnly cookie used by the web admin panel."""
    return (os.getenv("AUTH_COOKIE_NAME", "psm_access") or "psm_access").strip()


def auth_cookie_samesite():
    """Cookie SameSite policy (Lax blocks cross-site CSRF form posts)."""
    value = (os.getenv("AUTH_COOKIE_SAMESITE", "Lax") or "Lax").strip().lower()
    return value.capitalize() if value in {"lax", "strict", "none"} else "Lax"


def auth_cookie_secure():
    """Send the cookie over HTTPS only (always on in production)."""
    return _bool_env("AUTH_COOKIE_SECURE", force_https())


def refresh_token_ttl():
    """Lifetime of mobile refresh tokens (used for silent re-authentication).

    Refresh tokens only ever exchange for a fresh access token; they can't be
    used to reach data endpoints directly.
    """
    return _int_env("AUTH_REFRESH_TOKEN_TTL", 60 * 60 * 24 * 90)


def max_content_length():
    """Maximum accepted request body size in bytes (default 50 MB)."""
    return _int_env("MAX_CONTENT_LENGTH", 50 * 1024 * 1024)


def min_password_length():
    """Minimum length enforced for user-chosen passwords."""
    return _int_env("MIN_PASSWORD_LENGTH", 8)


def firebase_credentials_path():
    """Path to the Google/Firebase service-account JSON, if configured."""
    return (
        os.getenv("FIREBASE_CREDENTIALS")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        or ""
    ).strip()


def _weak_secret(value):
    if not value:
        return True
    if len(value) < 32:
        return True
    lowered = value.lower()
    return any(
        token in lowered
        for token in ("change", "secret", "password", "psm-", "insecure", "example", "admin")
    )


def require_cloudinary():
    """When true, production refuses to start without Cloudinary credentials."""
    return _bool_env("REQUIRE_CLOUDINARY", False)


def validate_config():
    """Return a list of production-blocking configuration problems.

    Empty list means the configuration is acceptable. Called at startup; in
    production any problem is fatal (see :func:`assert_valid_config`).
    """
    problems = []
    if not is_production():
        return problems

    if _weak_secret(os.getenv("AUTH_SECRET", "").strip()):
        problems.append(
            "AUTH_SECRET must be set to a strong random value (>= 32 chars) in production."
        )

    raw_cors = (os.getenv("CORS_ORIGINS", "") or "").strip()
    if raw_cors in ("", "*"):
        problems.append(
            "CORS_ORIGINS must be an explicit comma-separated allowlist in production."
        )

    if not auth_required():
        problems.append("AUTH_REQUIRED must be 1 in production.")

    admin_pass = os.getenv("ADMIN_PASSWORD", "")
    admin_hash = (os.getenv("ADMIN_PASSWORD_HASH", "") or "").strip()
    if not admin_pass and not admin_hash:
        problems.append("ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) must be set in production.")
    elif admin_pass and (
        len(admin_pass) < 12
        or admin_pass.lower() in ("admin", "admin123", "password", "changeme")
    ):
        problems.append("ADMIN_PASSWORD is too weak for production (use >= 12 random characters).")

    if _bool_env("FLASK_DEBUG", False):
        problems.append("FLASK_DEBUG must not be enabled in production.")

    if db_name() == "psm_test_integration":
        problems.append("Refusing to run production against the integration test database.")

    if require_cloudinary() and not cloudinary_enabled():
        problems.append(
            "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET "
            "must be set in production so uploads are stored outside MongoDB."
        )

    return problems


def assert_valid_config():
    """Raise RuntimeError in production when configuration is insecure."""
    problems = validate_config()
    if problems:
        joined = "\n  - ".join(problems)
        raise RuntimeError(
            "Refusing to start in production due to insecure configuration:\n  - " + joined
        )

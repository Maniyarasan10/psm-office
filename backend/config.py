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


def mongo_uri():
    uri = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/")
    if not uri or "cluster0.xxxxx.mongodb.net" in uri or uri.startswith("mongodb+srv://<"):
        return "mongodb://127.0.0.1:27017/"
    return uri


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
    """When true, responses are marked as HTTPS-only (HSTS + secure cookies)."""
    if _bool_env("FORCE_HTTPS", False):
        return True
    return (public_base_url() or "").lower().startswith("https://")


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
    return _int_env("AUTH_TOKEN_TTL", 60 * 60 * 24 * 7)


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

    return problems


def assert_valid_config():
    """Raise RuntimeError in production when configuration is insecure."""
    problems = validate_config()
    if problems:
        joined = "\n  - ".join(problems)
        raise RuntimeError(
            "Refusing to start in production due to insecure configuration:\n  - " + joined
        )

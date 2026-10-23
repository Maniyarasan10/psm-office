import os
from bson import ObjectId
from pymongo import MongoClient
from pymongo.errors import ConfigurationError, ConnectionFailure, OperationFailure, ServerSelectionTimeoutError
from datetime import datetime, date
from backend import config

_client = None
_db = None
# Identity of the connection the cached client was built for. The config is
# resolved lazily, so the target can change at runtime (tests point at a
# throwaway database); when it does, the client is rebuilt.
_connection_key = None
_dns_configured = False


def _configure_dns():
    """Point dnspython at fast resolvers before an ``srv`` URI is parsed.

    ``mongodb+srv://`` is resolved by dnspython, not by the socket layer. A slow
    system resolver (common on mobile hotspots) exhausts the lookup lifetime and
    pymongo reports "MongoDB unavailable" even though the network is fine. The
    resolvers from ``MONGO_DNS_SERVERS`` are tried first, then the system ones,
    with short per-server timeouts so one dead server cannot stall the whole
    lookup.
    """
    global _dns_configured

    if _dns_configured:
        return
    _dns_configured = True

    servers = config.mongo_dns_servers()
    if not servers:
        return

    try:
        import dns.resolver
    except ImportError:  # dnspython is only needed for srv URIs
        return

    try:
        resolver = dns.resolver.Resolver(configure=True)
        system = [server for server in resolver.nameservers if server]
    except Exception:
        resolver = dns.resolver.Resolver(configure=False)
        system = []

    resolver.nameservers = servers + [server for server in system if server not in servers]
    resolver.timeout = 2.5
    resolver.lifetime = 10
    # dnspython 2.x exposes no public setter; module-level resolve() reads this.
    dns.resolver._default_resolver = resolver


def _close_client():
    global _client, _db, _connection_key

    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
    _client = None
    _db = None
    _connection_key = None


def get_db():
    global _client, _db, _connection_key

    uri = config.mongo_uri()
    db_name = config.db_name()
    key = (uri, db_name)

    if _db is not None and key != _connection_key:
        # The connection target changed - drop the stale client so the new
        # database is picked up instead of the cached one.
        _close_client()

    if _db is None:
        try:
            _configure_dns()
            _client = MongoClient(
                uri,
                serverSelectionTimeoutMS=config.mongo_server_selection_timeout_ms(),
                connectTimeoutMS=10000,
                socketTimeoutMS=45000,
                # The free Atlas tier caps concurrent connections, so the pool
                # stays deliberately small.
                maxPoolSize=config.mongo_max_pool_size(),
                minPoolSize=0,
                retryWrites=True,
                appname="psm-office",
            )
            _db = _client.get_database(db_name)
            _connection_key = key
            _ensure_indexes()
        except (ConfigurationError, ConnectionFailure, OperationFailure, ServerSelectionTimeoutError) as exc:
            _close_client()
            if os.getenv("FLASK_ENV", "").lower() == "production":
                raise RuntimeError(f"Could not connect to MongoDB at startup: {exc}") from exc
            print(f"MongoDB unavailable, continuing without database: {exc}")
    return _db


def _ensure_indexes():
    db = _db
    db.employees.create_index("employee_id", unique=True)
    db.interns.create_index("intern_id", unique=True)
    db.attendance.create_index(
        [("person_type", 1), ("person_id", 1), ("date", 1)], unique=True
    )
    db.attendance.create_index("date")
    db.leave_requests.create_index("status")
    db.leave_requests.create_index("person_id")
    db.leave_requests.create_index("created_at")
    db.tasks.create_index("status")
    db.projects.create_index("status")
    db.projects.create_index("created_at")
    db.documents.create_index("category")
    db.finance.create_index("date")
    db.finance.create_index("type")
    db.finance.create_index("transaction_id")
    db.settings.create_index("key", unique=True)
    db.support_tickets.create_index("ticket_number", unique=True)
    db.support_tickets.create_index("person_id")
    db.support_tickets.create_index("status")
    db.support_tickets.create_index("created_at")
    db.notifications.create_index([("person_type", 1), ("person_id", 1), ("created_at", -1)])
    db.notifications.create_index("dedupe_key")
    db.announcements.create_index("created_at")
    _ensure_ttl_indexes(db)
    _seed_settings(db)


def _ensure_ttl_indexes(db):
    """Expire ephemeral collections so the database stays small.

    MongoDB removes expired documents itself roughly once a minute, which
    keeps the free tier's storage budget from creeping upwards.
    """
    day = 24 * 60 * 60
    try:
        db.notifications.create_index(
            "created_at",
            expireAfterSeconds=max(1, config.notification_ttl_days()) * day,
            name="ttl_notifications",
        )
        db.activity_log.create_index(
            "timestamp",
            expireAfterSeconds=max(1, config.activity_log_ttl_days()) * day,
            name="ttl_activity_log",
        )
        db.password_resets.create_index(
            "expires_at",
            expireAfterSeconds=0,
            name="ttl_password_resets",
        )
        # Photos that still live inside MongoDB (pre-Cloudinary) are dropped
        # once they are old enough; the migration script removes them sooner.
        db.photos.create_index(
            "created_at",
            expireAfterSeconds=max(1, config.legacy_photo_ttl_days()) * day,
            name="ttl_photos",
        )
    except OperationFailure:
        # An index with a different definition may already exist; the
        # remaining TTL indexes are still worth creating.
        pass


def _seed_settings(db):
    defaults = {
        "company_name": "PSM",
        "company_logo": "",
        "office_start": "09:30",
        "office_end": "18:30",
        "theme": "light",
        "office_latitude": "",
        "office_longitude": "",
        "allowed_radius_km": "5.0",
        "support_categories": (
            "IT / Technical,HR & Payroll,Facilities & Office,Attendance & Leave,General"
        ),
    }
    for key, value in defaults.items():
        if not db.settings.find_one({"key": key}):
            db.settings.insert_one({"key": key, "value": value})


class JSONEncoder:
    @staticmethod
    def default(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return str(obj)


def serialize_doc(doc):
    if doc is None:
        return None
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, datetime):
            doc[key] = value.isoformat()
        elif isinstance(value, date):
            doc[key] = value.isoformat()
        elif isinstance(value, dict):
            doc[key] = serialize_doc(value)
        elif isinstance(value, list):
            doc[key] = [
                serialize_doc(item) if isinstance(item, dict) else (str(item) if isinstance(item, ObjectId) else item)
                for item in value
            ]
    return doc

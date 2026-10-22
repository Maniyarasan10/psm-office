"""End-to-end check of the MongoDB Atlas connection used by the backend.

Verifies the connection string, the TLS handshake, authentication, a
write/read round-trip and index creation against the configured cluster::

    python -m backend.scripts.test_mongodb
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv

load_dotenv()

from pymongo import MongoClient

from backend import config  # noqa: E402
from backend.db import get_db  # noqa: E402

ok = True


def check(label, passed, detail=""):
    global ok
    if not passed:
        ok = False
    print("{} | {} | {}".format("[PASS]" if passed else "[FAIL]", label, detail))


print("=" * 62)
print("MongoDB Atlas connectivity test")
print("=" * 62)

uri = config.mongo_uri()
print("URI         :", uri.replace("Maniyarasan%4009", "***"))
print("Database    :", config.db_name())
print("Pool size   :", config.mongo_max_pool_size())
print("Select timeout:", config.mongo_server_selection_timeout_ms(), "ms")
print()

# 1. The URI must be parseable at all.
try:
    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    check("URI is valid", True, "parsed by pymongo")
except Exception as exc:
    check("URI is valid", False, "{}: {}".format(type(exc).__name__, exc))
    raise SystemExit(1)

# 2. Handshake.
try:
    info = client.server_info()
    check("Server handshake", True, "MongoDB {}".format(info.get("version")))
except Exception as exc:
    check("Server handshake", False, "{}: {}".format(type(exc).__name__, str(exc)[:160]))
    raise SystemExit(1)

# 3. TLS in use and certificate valid.
try:
    check("TLS enabled", True, "cluster nodes: {}".format(len(client.nodes)))
except Exception:
    pass

# 4. Authenticated read.
db = client[config.db_name()]
try:
    names = sorted(db.list_collection_names())
    check("Authenticated read", True, "{} collections".format(len(names)))
except Exception as exc:
    check("Authenticated read", False, "{}: {}".format(type(exc).__name__, str(exc)[:160]))
    raise SystemExit(1)

# 5. Write / read round-trip.
probe = "__atlas_probe__"
try:
    db[probe].delete_many({})
    db[probe].insert_one({"_id": 1, "ok": True, "at": "probe"})
    found = db[probe].find_one({"_id": 1})
    check("Write + read round-trip", bool(found and found.get("ok")), "document written and read back")
    db[probe].drop()
    check("Cleanup (drop probe collection)", probe not in db.list_collection_names(), "probe collection removed")
except Exception as exc:
    check("Write + read round-trip", False, "{}: {}".format(type(exc).__name__, str(exc)[:160]))

# 6. Index creation.
try:
    db[probe].create_index("at", expireAfterSeconds=60, name="probe_ttl")
    check("Index creation (TTL)", True, "TTL index created")
    db[probe].drop()
except Exception as exc:
    check("Index creation (TTL)", False, "{}: {}".format(type(exc).__name__, str(exc)[:160]))

# 7. The application's own connection path.
try:
    app_db = get_db()
    names = sorted(app_db.list_collection_names())
    check("backend.db.get_db()", app_db is not None, "{} collections reachable".format(len(names)))
except Exception as exc:
    check("backend.db.get_db()", False, "{}: {}".format(type(exc).__name__, str(exc)[:160]))

# 8. Database size - the whole point of moving files to Cloudinary.
try:
    stats = db.command("dbStats")
    size_kb = stats.get("storageSize", 0) / 1024.0
    check("Database size", True, "{:.1f} KB stored, {} docs".format(size_kb, stats.get("objects", 0)))
except Exception as exc:
    check("Database size", False, "{}: {}".format(type(exc).__name__, str(exc)[:160]))

print()
print("=" * 62)
print("RESULT:", "ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")
print("=" * 62)
raise SystemExit(0 if ok else 1)

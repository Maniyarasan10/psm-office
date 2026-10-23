from datetime import datetime
from bson import ObjectId
from backend.db import get_db, serialize_doc


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def all_documents(search=None, category=None):
    db = get_db()
    query = {}
    if search:
        query["$or"] = [
            {"file_name": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
            {"linked_person": {"$regex": search, "$options": "i"}},
        ]
    if category:
        query["category"] = category
    # The list endpoint only needs metadata; the file body lives in the media
    # backend and the legacy base64 column would otherwise bloat every call.
    docs = list(
        db.documents.find(
            query, {"file_data_base64": 0, "cloudinary_public_id": 0}
        ).sort("uploaded_at", -1)
    )
    for doc in docs:
        # Older records predate the ``shared`` flag: a file without a linked
        # person and without an allocation was visible to everyone.
        if "shared" not in doc:
            doc["shared"] = not bool(doc.get("linked_person")) and not bool(
                doc.get("visible_to")
            )
    return [serialize_doc(d) for d in docs]


def add_document(data):
    db = get_db()
    data["uploaded_at"] = datetime.utcnow()
    if "visible_to" not in data:
        data["visible_to"] = []
    if "shared" not in data:
        data["shared"] = not bool(data.get("linked_person")) and not bool(
            data.get("visible_to")
        )
    if data["shared"]:
        # A shared file is visible to everyone; per-person allocation is moot.
        data["linked_person"] = ""
        data["visible_to"] = []
    result = db.documents.insert_one(data)
    return str(result.inserted_id)


def rename_document(doc_id, new_name):
    db = get_db()
    db.documents.update_one(
        {"_id": _to_oid(doc_id)},
        {"$set": {"file_name": new_name}}
    )


def delete_document(doc_id):
    db = get_db()
    db.documents.delete_one({"_id": _to_oid(doc_id)})


def get_document(doc_id):
    db = get_db()
    doc = db.documents.find_one({"_id": _to_oid(doc_id)})
    return serialize_doc(doc)


def update_document(doc_id, data):
    db = get_db()
    safe_data = dict(data)
    safe_data.pop("_id", None)
    db.documents.update_one({"_id": _to_oid(doc_id)}, {"$set": safe_data})


def update_document_visibility(doc_id, linked_person="", visible_to=None, shared=None):
    db = get_db()
    update = {"linked_person": "" if shared else (linked_person or "")}
    if shared:
        # Sharing with everyone supersedes any per-person allocation.
        update["visible_to"] = []
    elif visible_to is not None:
        update["visible_to"] = visible_to
    if shared is not None:
        update["shared"] = bool(shared)
    else:
        update["shared"] = not bool(linked_person)
    db.documents.update_one({"_id": _to_oid(doc_id)}, {"$set": update})

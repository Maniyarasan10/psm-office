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
    # The list endpoint only needs metadata; the base64 file body is served by
    # /api/documents/<id>/download and would otherwise bloat every list call.
    docs = list(
        db.documents.find(query, {"file_data_base64": 0}).sort("uploaded_at", -1)
    )
    return [serialize_doc(d) for d in docs]


def add_document(data):
    db = get_db()
    data["uploaded_at"] = datetime.utcnow()
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

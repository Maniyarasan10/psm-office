from flask import Blueprint, request, jsonify, send_file, redirect
from backend.models.document_model import (
    all_documents, add_document, rename_document, delete_document, get_document,
    update_document_visibility,
)
from backend.utils.activity_log import log_activity
from backend.utils.auth import admin_required, auth_required, current_auth
from backend.utils.authz import is_admin
from backend.utils import storage
from backend.utils.uploads import validate_document_upload

document_bp = Blueprint("documents", __name__)

CATEGORIES = [
    "Company Logo", "Offer Letter", "NDA", "Letterhead",
    "Employee Documents", "Intern Documents", "Certificates", "Invoices",
]


def _doc_visible(auth, doc):
    """Can this caller see the document metadata/file?"""
    if not auth:
        return True  # decorators already enforce AUTH_REQUIRED in production
    if is_admin(auth):
        return True
    subject = str(auth.get("sub") or "")
    if not subject:
        return False
    person_type = auth.get("person_type") or ""
    keys = {subject}
    if person_type:
        keys.add(f"{person_type}:{subject}")
    if doc.get("shared"):
        return True
    if str(doc.get("uploaded_by_id") or "") in keys:
        return True
    if str(doc.get("linked_person") or "") in keys:
        return True
    visible_to = doc.get("visible_to") or []
    return any(str(value) in keys for value in visible_to)


def _delete_stored_file(doc):
    """Remove the stored file of a document from the media backend."""
    if not doc:
        return
    path = doc.get("file_path")
    if path:
        parsed = storage.parse_cloudinary_url(path)
        if parsed:
            storage.delete_by_public_id(parsed["public_id"], parsed["resource_type"])
        else:
            storage.delete(path)
        return
    public_id = doc.get("cloudinary_public_id")
    if public_id:
        storage.delete_by_public_id(public_id, "raw")


@document_bp.route("/api/documents", methods=["GET"])
@auth_required
def list_documents():
    search = request.args.get("search")
    category = request.args.get("category")
    docs = all_documents(search, category)
    auth = current_auth()
    if auth and not is_admin(auth):
        docs = [doc for doc in docs if _doc_visible(auth, doc)]
    return jsonify(docs)


@document_bp.route("/api/documents/upload", methods=["POST"])
@auth_required
def upload_document():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    category = request.form.get("category", "Employee Documents")
    linked_person = request.form.get("linked_person", "")
    shared = request.form.get("shared")
    visible_to_raw = request.form.get("visible_to") or request.form.get("visibility")

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    file_bytes, filename, error = validate_document_upload(file)
    if error:
        return jsonify({"error": error}), 400

    file_type = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    try:
        asset = storage.upload(
            file_bytes,
            filename=filename,
            kind=storage.KIND_DOCUMENTS,
            resource_type="raw",
            content_type=file.mimetype or None,
        )
    except storage.StorageError as exc:
        return jsonify({"error": str(exc)}), 400

    auth = current_auth()
    upload_record = {}
    if auth:
        upload_record["uploaded_by"] = auth.get("name") or auth.get("sub") or ""
        upload_record["uploaded_by_id"] = auth.get("sub") or ""
        upload_record["uploaded_by_type"] = (
            "admin" if auth.get("role") == "admin" else (auth.get("person_type") or "user")
        )

    visible_to = []
    if visible_to_raw:
        import json
        try:
            parsed = json.loads(visible_to_raw)
            if isinstance(parsed, list):
                visible_to = [str(v) for v in parsed if v]
        except Exception:
            if isinstance(visible_to_raw, str):
                visible_to = [v.strip() for v in visible_to_raw.split(",") if v.strip()]

    is_shared = (
        shared.lower() == "true"
        if isinstance(shared, str)
        else (not bool(linked_person) and not bool(visible_to))
    )
    auth = current_auth()
    if auth and not is_admin(auth):
        # Non-admin users cannot publish shared documents or attach them to
        # arbitrary people; uploads stay private to the uploader.
        is_shared = False
        linked_person = str(auth.get("sub") or "")
        visible_to = []

    doc_id = add_document({
        "file_name": filename,
        "category": category,
        "file_path": asset["url"],
        "storage": asset["storage"],
        "cloudinary_public_id": asset.get("public_id", ""),
        "content_type": file.mimetype or "application/octet-stream",
        "file_type": file_type,
        "linked_person": linked_person,
        "file_size": asset.get("bytes") or len(file_bytes),
        "visible_to": visible_to,
        "shared": bool(is_shared),
        **upload_record,
    })

    log_activity("File Uploaded", f"{filename} ({category})")
    return jsonify({
        "_id": doc_id,
        "file_name": filename,
        "file_url": asset["url"],
    }), 201


@document_bp.route("/api/documents/<doc_id>/rename", methods=["PUT"])
@admin_required
def rename_doc(doc_id):
    data = request.get_json() or {}
    new_name = data.get("new_name", "")
    doc = get_document(doc_id)
    if doc:
        rename_document(doc_id, new_name)
    return jsonify({"message": "Renamed"})


@document_bp.route("/api/documents/<doc_id>/visibility", methods=["PUT"])
@admin_required
def update_doc_visibility(doc_id):
    data = request.get_json() or {}
    linked_person = data.get("linked_person", "") or ""
    visible_to = data.get("visible_to") or data.get("visibility") or []
    shared = data.get("shared")
    if isinstance(visible_to, str):
        visible_to = [v.strip() for v in visible_to.split(",") if v.strip()]
    if not isinstance(visible_to, list):
        visible_to = []
    visible_to = [str(v).strip() for v in visible_to if str(v).strip()]
    try:
        update_document_visibility(doc_id, linked_person=linked_person, visible_to=visible_to, shared=shared)
    except Exception:
        pass
    log_activity("Document Visibility Updated", f"{doc_id}")
    return jsonify({"message": "Visibility updated"})


@document_bp.route("/api/documents/<doc_id>", methods=["DELETE"])
@admin_required
def delete_doc(doc_id):
    doc = get_document(doc_id)
    if doc:
        _delete_stored_file(doc)
        delete_document(doc_id)
    log_activity("File Deleted", doc.get("file_name", "") if doc else "")
    return jsonify({"message": "Deleted"})


@document_bp.route("/api/documents/<doc_id>/download", methods=["GET"])
@auth_required
def download_doc(doc_id):
    doc = get_document(doc_id)
    if not doc:
        return jsonify({"error": "File not found"}), 404
    auth = current_auth()
    if auth and not _doc_visible(auth, doc):
        return jsonify({"error": "Forbidden"}), 403

    # New documents live in the media backend: hand the client the CDN URL.
    path = doc.get("file_path")
    if path:
        return redirect(storage.download_url(path, doc.get("file_name")), code=302)

    # Legacy documents that still carry the file body inside MongoDB.
    if doc.get("file_data_base64"):
        import base64
        import io

        file_bytes = base64.b64decode(doc["file_data_base64"])
        return send_file(
            io.BytesIO(file_bytes),
            as_attachment=True,
            download_name=doc.get("file_name", "download"),
            mimetype=doc.get("content_type") or "application/octet-stream",
        )
    return jsonify({"error": "File not found"}), 404


@document_bp.route("/api/documents/<doc_id>/view", methods=["GET"])
@auth_required
def view_doc(doc_id):
    doc = get_document(doc_id)
    if not doc:
        return jsonify({"error": "File not found"}), 404
    auth = current_auth()
    if auth and not _doc_visible(auth, doc):
        return jsonify({"error": "Forbidden"}), 403
    path = doc.get("file_path")
    if path:
        return redirect(path, code=302)
    return jsonify({"error": "File not found"}), 404


@document_bp.route("/api/documents/categories", methods=["GET"])
@auth_required
def get_categories():
    return jsonify(CATEGORIES)

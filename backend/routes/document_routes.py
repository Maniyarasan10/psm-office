import base64
import io
from flask import Blueprint, request, jsonify, send_file
from backend.models.document_model import (
    all_documents, add_document, rename_document, delete_document, get_document,
)
from backend.utils.activity_log import log_activity
from backend.utils.auth import admin_required, auth_required, current_auth
from backend.utils.uploads import validate_document_upload

document_bp = Blueprint("documents", __name__)

CATEGORIES = [
    "Company Logo", "Offer Letter", "NDA", "Letterhead",
    "Employee Documents", "Intern Documents", "Certificates", "Invoices",
]


@document_bp.route("/api/documents", methods=["GET"])
@auth_required
def list_documents():
    search = request.args.get("search")
    category = request.args.get("category")
    docs = all_documents(search, category)
    return jsonify(docs)


@document_bp.route("/api/documents/upload", methods=["POST"])
@auth_required
def upload_document():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    category = request.form.get("category", "Employee Documents")
    linked_person = request.form.get("linked_person", "")

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    file_bytes, filename, error = validate_document_upload(file)
    if error:
        return jsonify({"error": error}), 400

    file_type = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    encoded = base64.b64encode(file_bytes).decode("ascii")

    auth = current_auth()
    upload_record = {}
    if auth:
        upload_record["uploaded_by"] = auth.get("name") or auth.get("sub") or ""
        upload_record["uploaded_by_id"] = auth.get("sub") or ""
        upload_record["uploaded_by_type"] = (
            "admin" if auth.get("role") == "admin" else (auth.get("person_type") or "user")
        )

    doc_id = add_document({
        "file_name": filename,
        "category": category,
        "file_path": "",
        "file_type": file_type,
        "linked_person": linked_person,
        "file_data_base64": encoded,
        "file_size": len(file_bytes),
        **upload_record,
    })

    log_activity("File Uploaded", f"{filename} ({category})")
    return jsonify({"_id": doc_id, "file_name": filename}), 201


@document_bp.route("/api/documents/<doc_id>/rename", methods=["PUT"])
@admin_required
def rename_doc(doc_id):
    data = request.get_json()
    new_name = data.get("new_name", "")
    doc = get_document(doc_id)
    if doc:
        rename_document(doc_id, new_name)
    return jsonify({"message": "Renamed"})


@document_bp.route("/api/documents/<doc_id>", methods=["DELETE"])
@admin_required
def delete_doc(doc_id):
    doc = get_document(doc_id)
    if doc:
        delete_document(doc_id)
    log_activity("File Deleted", doc.get("file_name", "") if doc else "")
    return jsonify({"message": "Deleted"})


@document_bp.route("/api/documents/<doc_id>/download", methods=["GET"])
@auth_required
def download_doc(doc_id):
    doc = get_document(doc_id)
    if doc and doc.get("file_data_base64"):
        file_bytes = base64.b64decode(doc["file_data_base64"])
        return send_file(
            io.BytesIO(file_bytes),
            as_attachment=True,
            download_name=doc.get("file_name", "download"),
            mimetype=doc.get("content_type") or "application/octet-stream",
        )
    return jsonify({"error": "File not found"}), 404


@document_bp.route("/api/documents/categories", methods=["GET"])
@auth_required
def get_categories():
    return jsonify(CATEGORIES)

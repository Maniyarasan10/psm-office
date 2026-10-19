from flask import Blueprint, request, jsonify
from backend.models.finance_model import (
    all_transactions, get_transaction, add_transaction,
    update_transaction, delete_transaction, get_summary,
    get_category_breakdown,
)
from backend.utils.auth import admin_required

finance_bp = Blueprint("finance", __name__)


@finance_bp.route("/api/finance", methods=["GET"])
@admin_required
def list_transactions():
    search = request.args.get("search")
    transactions = all_transactions(search)
    return jsonify(transactions)


@finance_bp.route("/api/finance/<transaction_id>", methods=["GET"])
@admin_required
def get_trans(transaction_id):
    trans = get_transaction(transaction_id)
    if trans:
        return jsonify(trans)
    return jsonify({"error": "Not found"}), 404


@finance_bp.route("/api/finance", methods=["POST"])
@admin_required
def create_transaction():
    data = request.get_json()
    transaction_id = add_transaction(data)
    return jsonify({"_id": transaction_id}), 201


@finance_bp.route("/api/finance/<transaction_id>", methods=["PUT"])
@admin_required
def update_trans(transaction_id):
    data = request.get_json()
    update_transaction(transaction_id, data)
    return jsonify({"message": "Updated"})


@finance_bp.route("/api/finance/<transaction_id>", methods=["DELETE"])
@admin_required
def delete_trans(transaction_id):
    delete_transaction(transaction_id)
    return jsonify({"message": "Deleted"})


@finance_bp.route("/api/finance/summary", methods=["GET"])
@admin_required
def summary():
    return jsonify(get_summary())


@finance_bp.route("/api/finance/category-breakdown", methods=["GET"])
@admin_required
def category_breakdown():
    return jsonify(get_category_breakdown())

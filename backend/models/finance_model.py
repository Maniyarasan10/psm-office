from datetime import datetime
from bson import ObjectId
from backend.db import get_db, serialize_doc


def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def all_transactions(search=None):
    db = get_db()
    query = {}
    if search:
        query["$or"] = [
            {"transaction_id": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
            {"notes": {"$regex": search, "$options": "i"}},
        ]
    docs = list(db.finance.find(query).sort("date", -1))
    return [serialize_doc(d) for d in docs]


def get_transaction(transaction_id):
    db = get_db()
    doc = db.finance.find_one({"_id": _to_oid(transaction_id)})
    return serialize_doc(doc)


def add_transaction(data):
    db = get_db()
    data["created_at"] = datetime.utcnow()
    data["updated_at"] = datetime.utcnow()
    result = db.finance.insert_one(data)
    return str(result.inserted_id)


def update_transaction(transaction_id, data):
    db = get_db()
    data["updated_at"] = datetime.utcnow()
    db.finance.update_one({"_id": _to_oid(transaction_id)}, {"$set": data})


def delete_transaction(transaction_id):
    db = get_db()
    db.finance.delete_one({"_id": _to_oid(transaction_id)})


def get_summary():
    db = get_db()
    pipeline = [
        {"$group": {
            "_id": "$type",
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }}
    ]
    results = list(db.finance.aggregate(pipeline))
    income = 0
    expense = 0
    for r in results:
        if r["_id"] == "Income":
            income = r["total"]
        elif r["_id"] == "Expense":
            expense = r["total"]
    balance = income - expense
    total_count = sum(r["count"] for r in results)
    return {
        "total_income": income,
        "total_expense": expense,
        "balance": balance,
        "total_transactions": total_count,
    }


def get_category_breakdown():
    db = get_db()
    pipeline = [
        {"$group": {
            "_id": {"type": "$type", "category": "$category"},
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total": -1}},
    ]
    results = list(db.finance.aggregate(pipeline))
    return [
        {
            "type": r["_id"]["type"],
            "category": r["_id"]["category"],
            "total": r["total"],
            "count": r["count"],
        }
        for r in results
    ]

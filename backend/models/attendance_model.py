from datetime import datetime, date as date_type, timedelta
from bson import ObjectId
from backend.db import get_db, serialize_doc

def _to_oid(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def for_date(target_date):
    db = get_db()
    if isinstance(target_date, str):
        target_date = date_type.fromisoformat(target_date)
    docs = list(db.attendance.find({"date": target_date.isoformat()}))
    return [serialize_doc(d) for d in docs]


def mark(person_type, person_id, target_date, status="Present",
         clock_in=None, clock_out=None, notes="",
         photo_path=None, latitude=None, longitude=None):
    db = get_db()
    if isinstance(target_date, str):
        target_date = date_type.fromisoformat(target_date)
    date_str = target_date.isoformat()

    existing = db.attendance.find_one({
        "person_type": person_type,
        "person_id": person_id,
        "date": date_str,
    })

    working_hours = None
    if clock_in and clock_out:
        try:
            fmt = "%H:%M"
            t_in = datetime.strptime(clock_in, fmt)
            t_out = datetime.strptime(clock_out, fmt)
            diff = (t_out - t_in).total_seconds() / 3600
            working_hours = round(diff, 2)
        except (ValueError, TypeError):
            pass

    data = {
        "person_type": person_type,
        "person_id": person_id,
        "date": date_str,
        "status": status,
        "clock_in": clock_in,
        "clock_out": clock_out,
        "working_hours": working_hours,
        "notes": notes,
        "updated_at": datetime.utcnow(),
    }

    if photo_path:
        data["photo_path"] = photo_path
    if latitude is not None:
        data["latitude"] = latitude
    if longitude is not None:
        data["longitude"] = longitude

    if existing:
        update_fields = {"$set": data}
        if photo_path and not existing.get("photo_path"):
            update_fields["$set"]["photo_path"] = photo_path
        if latitude is not None and existing.get("latitude") is None:
            update_fields["$set"]["latitude"] = latitude
        if longitude is not None and existing.get("longitude") is None:
            update_fields["$set"]["longitude"] = longitude
        db.attendance.update_one({"_id": existing["_id"]}, update_fields)
    else:
        data["created_at"] = datetime.utcnow()
        db.attendance.insert_one(data)


def clock_in(person_type, person_id, target_date, time_str,
             photo_path=None, latitude=None, longitude=None):
    db = get_db()
    if isinstance(target_date, str):
        target_date = date_type.fromisoformat(target_date)
    date_str = target_date.isoformat()

    existing = db.attendance.find_one({
        "person_type": person_type,
        "person_id": person_id,
        "date": date_str,
    })

    update_data = {
        "clock_in": time_str,
        "updated_at": datetime.utcnow(),
    }
    if photo_path:
        update_data["photo_path"] = photo_path
    if latitude is not None:
        update_data["latitude"] = latitude
    if longitude is not None:
        update_data["longitude"] = longitude

    if existing:
        db.attendance.update_one(
            {"_id": existing["_id"]},
            {"$set": update_data}
        )
    else:
        update_data.update({
            "person_type": person_type,
            "person_id": person_id,
            "date": date_str,
            "clock_out": None,
            "working_hours": None,
            "status": "Present",
            "notes": "",
            "created_at": datetime.utcnow(),
        })
        db.attendance.insert_one(update_data)


def clock_out(person_type, person_id, target_date, time_str):
    db = get_db()
    if isinstance(target_date, str):
        target_date = date_type.fromisoformat(target_date)
    date_str = target_date.isoformat()

    existing = db.attendance.find_one({
        "person_type": person_type,
        "person_id": person_id,
        "date": date_str,
    })

    if existing:
        working_hours = None
        clock_in_time = existing.get("clock_in")
        if clock_in_time:
            try:
                fmt = "%H:%M"
                t_in = datetime.strptime(clock_in_time, fmt)
                t_out = datetime.strptime(time_str, fmt)
                diff = (t_out - t_in).total_seconds() / 3600
                working_hours = round(diff, 2)
            except (ValueError, TypeError):
                pass

        db.attendance.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "clock_out": time_str,
                "working_hours": working_hours,
                "updated_at": datetime.utcnow(),
            }}
        )


def set_status(person_type, person_id, target_date, status):
    db = get_db()
    if isinstance(target_date, str):
        target_date = date_type.fromisoformat(target_date)
    date_str = target_date.isoformat()

    existing = db.attendance.find_one({
        "person_type": person_type,
        "person_id": person_id,
        "date": date_str,
    })

    if existing:
        db.attendance.update_one(
            {"_id": existing["_id"]},
            {"$set": {"status": status, "updated_at": datetime.utcnow()}}
        )
    else:
        db.attendance.insert_one({
            "person_type": person_type,
            "person_id": person_id,
            "date": date_str,
            "status": status,
            "clock_in": None,
            "clock_out": None,
            "working_hours": None,
            "notes": "",
            "photo_path": None,
            "latitude": None,
            "longitude": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        })


def mark_leave_range(person_type, person_id, start_date, end_date):
    """Set the ``Leave`` status on every day in an inclusive date range."""
    db = get_db()
    if db is None:
        return {"marked": 0}
    if isinstance(start_date, str):
        start_date = date_type.fromisoformat(start_date)
    if isinstance(end_date, str):
        end_date = date_type.fromisoformat(end_date)
    if start_date > end_date:
        return {"marked": 0}

    marked = 0
    for i in range((end_date - start_date).days + 1):
        target = start_date + timedelta(days=i)
        set_status(person_type, person_id, target.isoformat(), "Leave")
        marked += 1
    return {"marked": marked}


def today_summary(target_date):
    db = get_db()
    if isinstance(target_date, str):
        target_date = date_type.fromisoformat(target_date)
    date_str = target_date.isoformat()
    total = db.attendance.count_documents({"date": date_str})
    present = db.attendance.count_documents({"date": date_str, "status": "Present"})
    absent = db.attendance.count_documents({"date": date_str, "status": "Absent"})
    late = db.attendance.count_documents({"date": date_str, "status": "Late"})
    remote = db.attendance.count_documents({"date": date_str, "status": "Remote"})
    office = db.attendance.count_documents({"date": date_str, "status": "Office"})
    leave = db.attendance.count_documents({"date": date_str, "status": "Leave"})
    return {
        "total": total,
        "present": present,
        "absent": absent,
        "late": late,
        "remote": remote,
        "office": office,
        "leave": leave,
    }


def monthly_report(year, month):
    db = get_db()
    start = date_type(year, month, 1)
    if month == 12:
        end = date_type(year + 1, 1, 1)
    else:
        end = date_type(year, month + 1, 1)
    docs = list(db.attendance.find({
        "date": {"$gte": start.isoformat(), "$lt": end.isoformat()}
    }).sort("date", 1))
    return [serialize_doc(d) for d in docs]


def report_between(start_date, end_date):
    db = get_db()
    if isinstance(start_date, str):
        start_date = date_type.fromisoformat(start_date)
    if isinstance(end_date, str):
        end_date = date_type.fromisoformat(end_date)
    docs = list(db.attendance.find({
        "date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }).sort("date", 1))
    return [serialize_doc(d) for d in docs]


def report_summary_between(start_date, end_date):
    db = get_db()
    if isinstance(start_date, str):
        start_date = date_type.fromisoformat(start_date)
    if isinstance(end_date, str):
        end_date = date_type.fromisoformat(end_date)
    docs = list(db.attendance.find({
        "date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
    }))
    
    summary = {}
    for doc in docs:
        pid = doc.get("person_id")
        if not pid: continue
        
        if pid not in summary:
            ptype = doc.get("person_type", "employee")
            name = "Unknown"
            if ptype.lower() == "employee":
                emp = db.employees.find_one({"_id": _to_oid(pid)})
                if emp: name = emp.get("name", "Unknown")
            elif ptype.lower() == "intern":
                intern = db.interns.find_one({"_id": _to_oid(pid)})
                if intern: name = intern.get("name", "Unknown")
                
            summary[pid] = {
                "person_id": pid,
                "name": name,
                "person_type": ptype,
                "present": 0,
                "absent": 0,
                "late": 0,
                "remote": 0,
                "office": 0,
                "leave": 0,
                "total_hours": 0.0
            }
        
        status = doc.get("status", "")
        if status == "Present": summary[pid]["present"] += 1
        elif status == "Absent": summary[pid]["absent"] += 1
        elif status == "Late": summary[pid]["late"] += 1
        elif status == "Remote": summary[pid]["remote"] += 1
        elif status == "Office": summary[pid]["office"] += 1
        elif status == "Leave": summary[pid]["leave"] += 1
        
        hrs = doc.get("working_hours")
        if hrs: summary[pid]["total_hours"] += hrs
    
    result = list(summary.values())
    for r in result:
        r["total_hours"] = round(r["total_hours"], 2)
        
    result.sort(key=lambda x: x["name"])
    return result


def for_person(person_id, limit=30):
    db = get_db()
    docs = list(db.attendance.find(
        {"person_id": person_id}
    ).sort("date", -1).limit(limit))
    return [serialize_doc(d) for d in docs]


def _active_people():
    from backend.models.employee_model import all_employees
    from backend.models.intern_model import all_interns
    people = []
    for emp in all_employees():
        if emp.get("status") == "Active":
            people.append(("employee", emp["_id"]))
    for intern in all_interns():
        people.append(("intern", intern["_id"]))
    return people


def _office_end_time():
    try:
        from backend.models.settings_model import get_settings
        settings = get_settings()
    except Exception:
        settings = {}
    end_time_str = settings.get("office_end", "") or "18:30"
    try:
        return datetime.strptime(end_time_str, "%H:%M").time()
    except (ValueError, TypeError):
        return datetime.strptime("18:30", "%H:%M").time()


def auto_mark_absent(target_date):
    """Create 'Absent' records for active employees/interns who have no
    attendance record, once the working day (office_end) has ended."""
    db = get_db()
    if db is None:
        return {"marked": 0, "skipped": "no db"}
    if isinstance(target_date, str):
        try:
            target_date = date_type.fromisoformat(target_date)
        except ValueError:
            return {"marked": 0, "skipped": "invalid date"}

    today = date_type.today()
    if target_date > today:
        return {"marked": 0, "skipped": "future date"}
    if target_date == today and datetime.now().time() < _office_end_time():
        return {"marked": 0, "skipped": "working day not over"}

    date_str = target_date.isoformat()
    existing = set(
        (d["person_type"], d["person_id"])
        for d in db.attendance.find(
            {"date": date_str}, {"person_type": 1, "person_id": 1}
        )
    )

    now = datetime.utcnow()
    marked = 0
    for ptype, pid in _active_people():
        if (ptype, pid) in existing:
            continue
        db.attendance.insert_one({
            "person_type": ptype,
            "person_id": pid,
            "date": date_str,
            "status": "Absent",
            "clock_in": None,
            "clock_out": None,
            "working_hours": None,
            "notes": "",
            "photo_path": None,
            "latitude": None,
            "longitude": None,
            "created_at": now,
            "updated_at": now,
        })
        marked += 1
    return {"marked": marked}


def auto_mark_absent_range(start_date, end_date):
    """Mark absent for every date in [start_date, end_date] whose working
    day has already ended. Used to backfill attendance reports."""
    db = get_db()
    if db is None:
        return {"marked": 0}
    if isinstance(start_date, str):
        try:
            start_date = date_type.fromisoformat(start_date)
        except ValueError:
            return {"marked": 0}
    if isinstance(end_date, str):
        try:
            end_date = date_type.fromisoformat(end_date)
        except ValueError:
            return {"marked": 0}

    today = date_type.today()
    if end_date > today:
        end_date = today
    if start_date > end_date:
        return {"marked": 0}

    now_time = datetime.now().time()
    end_time = _office_end_time()
    dates = []
    for i in range((end_date - start_date).days + 1):
        target = start_date + timedelta(days=i)
        if target == today and now_time < end_time:
            continue
        dates.append(target)
    if not dates:
        return {"marked": 0}

    date_strs = [d.isoformat() for d in dates]
    existing = set(
        (d["date"], d["person_type"], d["person_id"])
        for d in db.attendance.find(
            {"date": {"$in": date_strs}},
            {"date": 1, "person_type": 1, "person_id": 1},
        )
    )

    now = datetime.utcnow()
    marked = 0
    for date_str in date_strs:
        for ptype, pid in _active_people():
            if (date_str, ptype, pid) in existing:
                continue
            db.attendance.insert_one({
                "person_type": ptype,
                "person_id": pid,
                "date": date_str,
                "status": "Absent",
                "clock_in": None,
                "clock_out": None,
                "working_hours": None,
                "notes": "",
                "photo_path": None,
                "latitude": None,
                "longitude": None,
                "created_at": now,
                "updated_at": now,
            })
            marked += 1
    return {"marked": marked}


def auto_mark_absent_for_person(person_type, person_id, start_date=None, end_date=None):
    """Create 'Absent' records for a single employee/intern for every date
    in [start_date, end_date] whose working day has already ended. Defaults
    to the person's first attendance record through today."""
    db = get_db()
    if db is None:
        return {"marked": 0}

    today = date_type.today()
    if end_date is None:
        end_date = today
    elif isinstance(end_date, str):
        try:
            end_date = date_type.fromisoformat(end_date)
        except ValueError:
            end_date = today
    if end_date > today:
        end_date = today

    if start_date is None:
        earliest = db.attendance.find_one(
            {"person_type": person_type, "person_id": person_id},
            {"date": 1},
        )
        if earliest is not None:
            try:
                start_date = date_type.fromisoformat(earliest.get("date"))
            except (ValueError, TypeError):
                start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=30)
    elif isinstance(start_date, str):
        try:
            start_date = date_type.fromisoformat(start_date)
        except ValueError:
            return {"marked": 0}

    if start_date > end_date:
        return {"marked": 0}

    now_time = datetime.now().time()
    end_time = _office_end_time()
    dates = []
    for i in range((end_date - start_date).days + 1):
        target = start_date + timedelta(days=i)
        if target == today and now_time < end_time:
            continue
        dates.append(target)
    if not dates:
        return {"marked": 0}

    date_strs = [d.isoformat() for d in dates]
    existing = set(
        d["date"]
        for d in db.attendance.find(
            {"person_type": person_type, "person_id": person_id,
             "date": {"$in": date_strs}},
            {"date": 1},
        )
    )

    now = datetime.utcnow()
    marked = 0
    for date_str in date_strs:
        if date_str in existing:
            continue
        db.attendance.insert_one({
            "person_type": person_type,
            "person_id": person_id,
            "date": date_str,
            "status": "Absent",
            "clock_in": None,
            "clock_out": None,
            "working_hours": None,
            "notes": "",
            "photo_path": None,
            "latitude": None,
            "longitude": None,
            "created_at": now,
            "updated_at": now,
        })
        marked += 1
    return {"marked": marked}


def person_summary(person_id):
    db = get_db()
    total = db.attendance.count_documents({"person_id": person_id})
    present = db.attendance.count_documents({"person_id": person_id, "status": "Present"})
    absent = db.attendance.count_documents({"person_id": person_id, "status": "Absent"})
    late = db.attendance.count_documents({"person_id": person_id, "status": "Late"})
    remote = db.attendance.count_documents({"person_id": person_id, "status": "Remote"})
    office = db.attendance.count_documents({"person_id": person_id, "status": "Office"})
    leave = db.attendance.count_documents({"person_id": person_id, "status": "Leave"})

    pipeline = [
        {"$match": {"person_id": person_id, "working_hours": {"$ne": None}}},
        {"$group": {"_id": None, "total_hours": {"$sum": "$working_hours"}}},
    ]
    hours_result = list(db.attendance.aggregate(pipeline))
    total_hours = round(hours_result[0]["total_hours"], 2) if hours_result else 0

    pipeline_avg = [
        {"$match": {"person_id": person_id, "working_hours": {"$ne": None}}},
        {"$group": {"_id": None, "avg_hours": {"$avg": "$working_hours"}}},
    ]
    avg_result = list(db.attendance.aggregate(pipeline_avg))
    avg_hours = round(avg_result[0]["avg_hours"], 2) if avg_result else 0

    return {
        "total": total,
        "present": present,
        "absent": absent,
        "late": late,
        "remote": remote,
        "office": office,
        "leave": leave,
        "total_hours": total_hours,
        "avg_hours": avg_hours,
        "attendance_rate": round((present + late + remote + office) / total * 100, 1) if total > 0 else 0,
    }

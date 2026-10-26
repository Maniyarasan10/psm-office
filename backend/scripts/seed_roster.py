"""Seed the PSM Office roster (employees + interns) into MongoDB.

The records are written straight into the database - no API round-trip - so
the roster can be loaded in one shot. Every person is matched on their ID and
updated in place, which makes the script safe to re-run after the sheet
changes::

    python -m backend.scripts.seed_roster --dry-run   # show the plan only
    python -m backend.scripts.seed_roster             # write to the database

New people get a random temporary password. The passwords are printed once and
written to ``backend/roster-credentials.csv`` (git-ignored) so the office can
distribute them; nobody is emailed automatically.

Field mapping (the sheet -> the documents):

    Employee / Name       -> name
    Role                  -> designation
    Department            -> department
    contact               -> phone (digits only)
    Mode                  -> work_mode  ("On-site" / "Remote" / "Hybrid")
    Status                -> status     ("working" -> "Active")
    Email                 -> email
    Employee id           -> employee_id / intern_id
    current project       -> current_project
    GitHub link           -> github
    intern mentor         -> mentor_id + mentor_name (interns only)
"""
import argparse
import csv
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from werkzeug.security import generate_password_hash  # noqa: E402

from backend.db import get_db  # noqa: E402
from backend.utils.passwords import generate_temp_password  # noqa: E402

CREDENTIALS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "roster-credentials.csv"
)

# ---------------------------------------------------------------------------
# The roster, exactly as it appears in the sheet.
# mode: the "Mode" column. status: the "Status" column (it holds "working"
# for employees and a work mode for several interns).
# ---------------------------------------------------------------------------
ROSTER_EMPLOYEES = [
    # id, name, role, department, contact, mode, status, email, project, github
    ("PSM001", "Prasanna Venkatesan R", "CTO", "Management", "9360207861", "on-site", "working",
     "prasanna30102005@gmail.com", "", ""),
    ("PSM002", "Maniyarasan S", "CEO", "Management", "7339386911", "on-site", "working",
     "smaniyarasan0904@gmail.com", "", ""),
    ("PSM006", "Lohan K J", "Data Analyst", "Development", "7339013339", "on-site", "working",
     "lohankanagaraj@gmail.com", "", ""),
    ("PSM003", "Divyalakshmi K", "Ai & Software development", "Management", "9360633957", "Remote", "working",
     "k.divyalakshmi22@gmail.com", "", ""),
    ("PSM010", "Praveen S", "Python Full Stack Developer", "Development", "9345828128", "on-site", "working",
     "praveens4u2006@gmail.com", "", ""),
    ("PSM007", "Mohanasundaram M", "Market Analyst Engineer", "Marketing", "9751985197", "on-site", "working",
     "mohanvalar07@gmail.com", "", ""),
    ("PSM011", "Navadheep Senbaga Priyan C", "Lead Gen Engineer", "Marketing", "6383920620", "on-site", "working",
     "navadheep926@gmail.com", "", ""),
    ("PSM004", "Sivasakthi R", "Project Manager", "Management", "9789673120", "on-site", "working",
     "sivasakthi2007ramakrishnan@gmail.com", "", ""),
    ("PSM012", "Manogar S", "Research Analyst", "R&D", "8680913368", "on-site", "working",
     "manogarm263@gmail.com", "", ""),
    ("PSM008", "Jeevanatham S", "Business Development Executive", "R&D", "9345905356", "on-site", "working",
     "jeevanandhamsakthivel619@gmail.com", "", ""),
    ("PSM005", "Gopika D", "Human Resources Manager", "Development", "8148690996", "on-site", "working",
     "rama8785343@gmail.com", "", ""),
    ("PSM009", "Logeshwaran S", "Java FullStack", "Development", "7871699871", "on-site", "working",
     "logeshwaran0525@gmail.com", "", ""),
]

ROSTER_INTERNS = [
    # id, name, role, mentor, department, contact, mode, status, email, project, github
    ("PSMI003", "Keerthana P", "Python web developer (intern)", "", "intern",
     "", "Remote", "working", "keerthanapanjatsaram@gmail.com", "", ""),
    ("PSMI004", "Aniz Fathima R", "Gen AI & LLM Engineer", "", "intern",
     "8838784588", "remote", "working", "anizfathima132007@gmail.com", "", ""),
    ("PSMI005", "Bhuvaneshwari.S", "Gen AI & LLM Engineer", "", "intern",
     "8608146095", "remote", "working", "bhuvaneshwari27006@gmail.com", "", ""),
    ("PSMI006", "Kaviya T", "Data Analyst", "", "intern",
     "8608424340", "REMOTE", "working", "kaviyathamarai932@gmail.com", "", ""),
    ("PSMI007", "pade Venkata Anusha", "Gen AI & LLM Engineer", "", "intern",
     "7093561016", "on-site", "working", "anushapade07@gmail.com", "", ""),
    ("PSMI009", "Ramana M", "full stack developer", "", "intern",
     "7708280220", "on-site", "working", "ramanamurugan46@gmail.com", "", ""),
    ("PSMI010", "S.Manoranjankumar", "Gen AI & LLM Engineer", "", "intern",
     "8015568894", "REMOTE", "working", "manosvsm20070@gmail.com", "", ""),
    ("PSMI011", "Senthilnathan M", "Data Analyst", "", "intern",
     "9342724307", "Remote", "working", "mrsurendhar11@gmail.com", "", ""),
    ("PSMI012", "Karthikeyan K", "Data analyst", "", "intern",
     "8122006649", "Remote", "working", "karthikalidasan14@gmail.com", "", ""),
    ("PSMI013", "SOMA SUNDHARAM S", "DATA SCIENTIST", "", "intern",
     "6303300918", "Remote", "working", "somasundharams767@gmail.com", "", ""),
    ("PSMI014", "Syed Faruk B", "Data analyst", "", "intern",
     "8531923385", "Remote", "working", "syedfaruk718@gmail.com", "", ""),
    ("PSMI015", "Anees Baig J", "Gen AI & LLM Engineer", "", "intern",
     "834416441", "REMOTE", "working", "anees151978@gmail.com", "", ""),
    ("PSMI016", "Akilan. R", "Data scientist", "", "intern",
     "7538838958", "REMOTE", "working", "akilanrajasekaran2007@gmail.com", "", ""),
    ("PSMI017", "Nusrath banu. H", "Data scientist", "", "intern",
     "9843913198", "REMOTE", "working", "nusrathbanuot@gmail.com", "", ""),
    ("PSMI018", "Kaviya K", "Software developer", "", "intern",
     "9363960183", "Remote", "working", "dkaviya69@gmail.com", "", ""),
    ("PSMI008", "Saran R", "Data scientist", "", "intern",
     "9751550472", "on-site", "working", "saran051119@gmail.com", "", ""),
]


def clean_phone(value):
    """Digits only - the sheet sometimes splits a number across two cells."""
    return "".join(ch for ch in (value or "") if ch.isdigit())


def clean_github(value):
    """Turn a bare ``github.com/user`` into a full URL."""
    value = (value or "").strip()
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("github.com/") or value.startswith("www.github.com/"):
        return "https://" + value.replace("www.", "")
    return "https://github.com/" + value


def work_mode(mode, status):
    """The sheet keeps the work mode in the "Mode" column; for several interns
    the "Status" column carries it instead ("working" means on-site)."""
    for candidate in (mode, status):
        value = (candidate or "").strip().lower()
        if value in ("remote", "remotes"):
            return "Remote"
        if value in ("hybrid", "hybrids"):
            return "Hybrid"
        if value in ("on-site", "onsite", "on site"):
            return "On-site"
    return ""


def mentor_key(name):
    """Mentors are written several ways in the sheet ("LOGAN KJ", "Lohan K J")."""
    return "".join(ch for ch in (name or "").upper() if ch.isalnum())


def employee_doc(row):
    employee_id, name, role, department, contact, mode, status, email, project, github = row
    return {
        "employee_id": employee_id,
        "name": name,
        "designation": role,
        "department": department,
        "phone": clean_phone(contact),
        "email": (email or "").strip(),
        "status": "Active",
        "work_mode": work_mode(mode, status),
        "current_project": (project or "").strip(),
        "github": clean_github(github),
        "joining_date": "",
        "dob": "",
        "notes": "",
        "photo_path": "",
    }


def intern_doc(row):
    (intern_id, name, role, mentor, department, contact, mode, status,
     email, project, github) = row
    return {
        "intern_id": intern_id,
        "name": name,
        "designation": role,
        "department": "Intern",
        "phone": clean_phone(contact),
        "email": (email or "").strip(),
        "status": "Active",
        "work_mode": work_mode(mode, status),
        "current_project": (project or "").strip(),
        "github": clean_github(github),
        "college": "",
        "duration": "",
        "start_date": "",
        "end_date": "",
        "remarks": "",
        "photo_path": "",
        "_mentor_name": mentor,
    }


def resolve_mentors(db, docs):
    """Attach the mentor's document id so the dashboard can show live details."""
    by_name = {}
    for employee in db.employees.find():
        by_name[mentor_key(employee.get("name"))] = employee
    # The sheet spells a couple of mentors differently.
    for alias, real in (("LOGAN KJ", "Lohan K J"), ("Maniyarasan", "Maniyarasan S")):
        if by_name.get(mentor_key(real)):
            by_name[mentor_key(alias)] = by_name[mentor_key(real)]

    unresolved = []
    for doc in docs:
        wanted = doc.pop("_mentor_name", "")
        if not wanted:
            continue
        mentor = by_name.get(mentor_key(wanted))
        if not mentor:
            unresolved.append((doc.get("name"), wanted))
            continue
        doc["mentor_id"] = str(mentor["_id"])
        doc["mentor"] = mentor.get("name", "")
        doc["mentor_name"] = mentor.get("name", "")
    return unresolved


def upsert(collection, key, doc, credentials, dry_run):
    """Insert or update one person; every person gets a fresh temporary
    password so roster-credentials.csv stays in sync with the database."""
    existing = collection.find_one({key: doc[key]})
    password = generate_temp_password(12)
    if existing:
        doc["created_at"] = existing.get("created_at", datetime.utcnow())
        doc["password_hash"] = generate_password_hash(password)
        if not dry_run:
            collection.update_one({"_id": existing["_id"]}, {"$set": doc})
        action = "updated"
    else:
        doc["created_at"] = datetime.utcnow()
        doc["password_hash"] = generate_password_hash(password)
        if not dry_run:
            collection.insert_one(doc)
        action = "created"
    credentials.append({
        "person_type": collection.name,
        "id": doc[key],
        "name": doc["name"],
        "email": doc.get("email", ""),
        "temporary_password": password,
    })
    return action


def write_credentials(rows):
    with open(CREDENTIALS_FILE, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["person_type", "id", "name", "email", "temporary_password"],
        )
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Seed the PSM Office roster into MongoDB.")
    parser.add_argument("--dry-run", action="store_true", help="show what would change")
    args = parser.parse_args()

    db = get_db()
    if db is None:
        raise SystemExit("Could not reach the database - check MONGO_URI in backend/.env")

    credentials = []
    unresolved = []

    employee_docs = [employee_doc(row) for row in ROSTER_EMPLOYEES]
    intern_docs = [intern_doc(row) for row in ROSTER_INTERNS]

    created = updated = 0
    for doc in employee_docs:
        action = upsert(db.employees, "employee_id", doc, credentials, args.dry_run)
        created += action == "created"
        updated += action == "updated"

    # Mentors are employees, so they are resolved once the employees are in.
    unresolved = resolve_mentors(db, intern_docs)
    for doc in intern_docs:
        action = upsert(db.interns, "intern_id", doc, credentials, args.dry_run)
        created += action == "created"
        updated += action == "updated"

    # Keep the auto-generated IDs climbing past the imported ones.
    if not args.dry_run:
        db.counters.update_one({"_id": "employee_id"}, {"$max": {"seq": len(ROSTER_EMPLOYEES)}}, upsert=True)
        db.counters.update_one({"_id": "intern_id"}, {"$max": {"seq": len(ROSTER_INTERNS)}}, upsert=True)

    print("{} employees, {} interns prepared".format(len(employee_docs), len(intern_docs)))
    print("created: {} | updated: {}".format(created, updated))
    if unresolved:
        print("unresolved mentors:")
        for name, wanted in unresolved:
            print("  - {}: {!r}".format(name, wanted))
    if credentials:
        print("{} temporary password(s) generated".format(len(credentials)))
        if not args.dry_run:
            write_credentials(credentials)
            print("written to {}".format(CREDENTIALS_FILE))
    if args.dry_run:
        print("dry run - nothing was written")
    else:
        print("employees in db: {}".format(db.employees.count_documents({})))
        print("interns in db: {}".format(db.interns.count_documents({})))


if __name__ == "__main__":
    main()

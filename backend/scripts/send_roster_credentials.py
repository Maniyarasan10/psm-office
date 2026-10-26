"""Email the roster login credentials recorded in ``roster-credentials.csv``.

The CSV is written by ``seed_roster`` with one temporary password per person.
This script delivers those credentials through the configured SMTP account::

    python -m backend.scripts.send_roster_credentials --dry-run   # show the plan
    python -m backend.scripts.send_roster_credentials             # send

Rows without an email address are skipped and reported.
"""
import argparse
import csv
import os
import sys
import time

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from backend.utils.mailer import send_credentials_email  # noqa: E402

CREDENTIALS_FILE = os.path.join(BACKEND_DIR, "roster-credentials.csv")
PERSON_TYPES = {"employees": "employee", "interns": "intern"}


def load_rows(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main():
    parser = argparse.ArgumentParser(description="Email roster credentials.")
    parser.add_argument("--dry-run", action="store_true", help="show the plan only")
    parser.add_argument("--only", action="append", default=[], help="send to these IDs only")
    parser.add_argument("--limit", type=int, default=0, help="send to at most N people")
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between sends")
    args = parser.parse_args()

    if not os.path.exists(CREDENTIALS_FILE):
        raise SystemExit(f"Missing {CREDENTIALS_FILE} - run seed_roster first.")

    rows = load_rows(CREDENTIALS_FILE)
    wanted = {value.upper() for value in args.only}
    if wanted:
        rows = [row for row in rows if row["id"].upper() in wanted]
    if args.limit:
        rows = rows[: args.limit]

    sent = skipped = failed = 0
    for row in rows:
        identifier = (row.get("id") or "").strip()
        name = (row.get("name") or "").strip()
        email = (row.get("email") or "").strip()
        password = row.get("temporary_password") or ""
        person_type = PERSON_TYPES.get((row.get("person_type") or "").strip(), "employee")

        if not email:
            print(f"SKIP  {identifier} {name}: no email address")
            skipped += 1
            continue
        if not password:
            print(f"SKIP  {identifier} {name}: no password in the CSV")
            skipped += 1
            continue

        if args.dry_run:
            print(f"PLAN  {identifier} {name} <{email}> [{person_type}]")
            continue

        ok, reason = send_credentials_email(email, name, identifier, password, person_type)
        if ok:
            print(f"SENT  {identifier} {name} <{email}>")
            sent += 1
        else:
            print(f"FAIL  {identifier} {name} <{email}>: {reason}")
            failed += 1
        if args.delay:
            time.sleep(args.delay)

    if args.dry_run:
        print(f"\nDry run: {len(rows)} row(s) considered, {skipped} would be skipped.")
        return

    print(f"\nDone: {sent} sent, {failed} failed, {skipped} skipped.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

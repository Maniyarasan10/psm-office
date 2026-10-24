"""Integration tests for the shared backend (admin panel + mobile app).

Runs against a throwaway MongoDB database (``MONGO_DB_NAME=psm_test_integration``)
using Flask's in-process test client, so no real data is touched.

Run from the repository root:
    python -m unittest backend.tests.test_integration -v
"""
import os
import unittest

TEST_DB = "psm_test_integration"
ADMIN_USER = "admin"
ADMIN_PASS = "test-pass"
USER_PASS = "user-pass"


def setUpModule():
    os.environ["MONGO_DB_NAME"] = TEST_DB
    os.environ["ADMIN_USERNAME"] = ADMIN_USER
    os.environ["ADMIN_PASSWORD"] = ADMIN_PASS
    os.environ["AUTH_REQUIRED"] = "0"
    os.environ["AUTH_SECRET"] = "integration-test-secret"
    os.environ["ENABLE_PUSH"] = "0"

    from pymongo import MongoClient

    cleanup_client = MongoClient(os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/"))
    cleanup_client.drop_database(TEST_DB)
    cleanup_client.close()

    from backend.app import app

    globals()["_app"] = app


def tearDownModule():
    try:
        from backend.db import get_db

        get_db().client.drop_database(TEST_DB)
    except Exception:
        pass


class BackendIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = _app
        cls.client = cls.app.test_client()

        # Shared fixture: an administrator token and a real employee + user token.
        admin_res = cls.client.post(
            "/api/auth/admin-login",
            json={"username": ADMIN_USER, "password": ADMIN_PASS},
        )
        assert admin_res.status_code == 200, admin_res.get_data(as_text=True)
        cls.admin_token = admin_res.get_json()["token"]

        create = cls.client.post(
            "/api/employees",
            json={
                "employee_id": "INT001",
                "name": "Integration User",
                "status": "Active",
                "password": USER_PASS,
            },
        )
        assert create.status_code == 201, create.get_data(as_text=True)
        cls.employee_id = create.get_json()["_id"]

        setpw = cls.client.post(
            "/api/auth/set-password",
            json={"employee_id": "INT001", "person_type": "employee", "new_password": USER_PASS},
        )
        assert setpw.status_code == 200, setpw.get_data(as_text=True)

        user_res = cls.client.post(
            "/api/auth/login",
            json={"employee_id": "INT001", "password": USER_PASS},
        )
        assert user_res.status_code == 200, user_res.get_data(as_text=True)
        cls.user_token = user_res.get_json()["token"]

    def _set_required(self, enabled):
        os.environ["AUTH_REQUIRED"] = "1" if enabled else "0"

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}"} if token else {}

    # ------------------------------------------------------------------ auth

    def test_admin_login_returns_token(self):
        res = self.client.post(
            "/api/auth/admin-login",
            json={"username": ADMIN_USER, "password": ADMIN_PASS},
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["role"], "admin")
        self.assertIn("token", data)

    def test_user_login_returns_token(self):
        login = self.client.post(
            "/api/auth/login",
            json={"employee_id": "INT001", "password": USER_PASS},
        )
        self.assertEqual(login.status_code, 200)
        data = login.get_json()
        self.assertEqual(data["person_type"], "employee")
        self.assertIn("token", data)

    # -------------------------------------------------- authorization boundary

    def test_admin_endpoints_enforced(self):
        self._set_required(True)
        try:
            admin = self._auth(self.admin_token)
            user = self._auth(self.user_token)

            cases = [
                ("GET", "/api/finance", None, 401),
                ("GET", "/api/finance", {}, 401),
                ("GET", "/api/finance", user, 403),
                ("GET", "/api/finance", admin, 200),
                ("GET", "/api/dashboard", None, 401),
                ("GET", "/api/dashboard", user, 403),
                ("GET", "/api/dashboard", admin, 200),
                ("POST", "/api/employees", None, 401),
                (
                    "POST",
                    "/api/employees",
                    user,
                    403,
                ),
                (
                    "DELETE",
                    f"/api/employees/{self.employee_id}",
                    user,
                    403,
                ),
                ("POST", "/api/auth/set-password", None, 401),
                ("GET", "/api/finance", {"Authorization": "Bearer bogus"}, 401),
            ]
            self.client.delete_cookie("psm_access")
            for method, path, headers, expected in cases:
                res = self.client.open(
                    path,
                    method=method,
                    headers=headers,
                    json=({"employee_id": "INT002", "name": "X", "password": "p"} if method == "POST" and path == "/api/employees" else None),
                )
                self.assertEqual(
                    res.status_code,
                    expected,
                    f"{method} {path} (headers={headers}) -> {res.status_code}, expected {expected}",
                )
        finally:
            self._set_required(False)

    def test_mobile_facing_reads_stay_open(self):
        self._set_required(True)
        try:
            user = self._auth(self.user_token)
            # Directory, own attendance and settings must work for a logged-in user.
            res = self.client.get("/api/employees", headers=user)
            self.assertEqual(res.status_code, 200)
            res = self.client.get("/api/attendance", query_string={"date": "2026-10-01"}, headers=user)
            self.assertEqual(res.status_code, 200)
            res = self.client.get("/api/settings")
            self.assertEqual(res.status_code, 200)
        finally:
            self._set_required(False)

    def test_backward_compatible_when_not_enforced(self):
        self._set_required(False)
        res = self.client.get("/api/finance")
        self.assertEqual(res.status_code, 200)
        res = self.client.post(
            "/api/employees",
            json={"employee_id": "INT002", "name": "Legacy User", "password": "x"},
        )
        self.assertEqual(res.status_code, 201)

    # -------------------------------------------------- admin -> mobile visibility

    def test_admin_task_appears_for_mobile_person(self):
        admin = self._auth(self.admin_token)
        create = self.client.post(
            "/api/tasks",
            json={
                "title": "Integration Task",
                "assigned_to": self.employee_id,
                "assigned_type": "employee",
                "priority": "medium",
                "deadline": "2026-12-31",
                "status": "Pending",
            },
            headers=admin,
        )
        self.assertEqual(create.status_code, 201)
        task_id = create.get_json()["_id"]

        res = self.client.get(
            f"/api/tasks/person/{self.employee_id}",
            query_string={"type": "employee"},
        )
        self.assertEqual(res.status_code, 200)
        titles = [t.get("title") for t in res.get_json()]
        self.assertIn("Integration Task", titles)

        # Mobile marks the task in progress; admin list reflects it.
        update = self.client.put(f"/api/tasks/{task_id}", json={"status": "In Progress"})
        self.assertEqual(update.status_code, 200)
        admin_list = self.client.get("/api/tasks", headers=admin)
        self.assertEqual(admin_list.status_code, 200)
        tasks = admin_list.get_json()
        target = next((t for t in tasks if t.get("_id") == task_id), None)
        self.assertIsNotNone(target)
        self.assertEqual(target.get("status"), "In Progress")

    # -------------------------------------------------- document uploader

    def test_document_upload_records_uploader(self):
        import io

        admin_upload = self.client.post(
            "/api/documents/upload",
            data={
                "file": (io.BytesIO(b"admin file contents"), "admin-notes.txt"),
                "category": "Employee Documents",
            },
            content_type="multipart/form-data",
            headers=self._auth(self.admin_token),
        )
        self.assertEqual(admin_upload.status_code, 201)

        user_upload = self.client.post(
            "/api/documents/upload",
            data={
                "file": (io.BytesIO(b"user file contents"), "user-notes.txt"),
                "category": "Employee Documents",
            },
            content_type="multipart/form-data",
            headers=self._auth(self.user_token),
        )
        self.assertEqual(user_upload.status_code, 201)

        docs = self.client.get("/api/documents").get_json()
        by_name = {d["file_name"]: d for d in docs}

        self.assertEqual(by_name["admin-notes.txt"]["uploaded_by"], ADMIN_USER)
        self.assertEqual(by_name["admin-notes.txt"]["uploaded_by_type"], "admin")
        self.assertEqual(by_name["user-notes.txt"]["uploaded_by"], "Integration User")
        self.assertEqual(by_name["user-notes.txt"]["uploaded_by_type"], "employee")

    # -------------------------------------------------- token mechanics

    def test_refresh_token_flow(self):
        from backend.utils.auth import verify_token

        login = self.client.post(
            "/api/auth/login",
            json={"employee_id": "INT001", "password": USER_PASS},
        )
        data = login.get_json()
        self.assertEqual(login.status_code, 200)
        self.assertIn("token", data)
        self.assertIn("refresh_token", data)

        # Admin login now also mints a refresh token (cookie + body) so the web
        # panel can silently refresh the session without re-entering credentials.
        admin = self.client.post(
            "/api/auth/admin-login",
            json={"username": ADMIN_USER, "password": ADMIN_PASS},
        ).get_json()
        self.assertIn("token", admin)
        self.assertIn("refresh_token", admin)
        self.assertEqual(admin["role"], "admin")

        # Exchanging the refresh token yields a fresh access token pair.
        exchange = self.client.post(
            "/api/auth/refresh-token",
            json={"refresh_token": data["refresh_token"]},
        )
        self.assertEqual(exchange.status_code, 200)
        pair = exchange.get_json()
        self.assertIn("token", pair)
        self.assertIn("refresh_token", pair)
        self.assertEqual(pair["role"], "user")

        access = verify_token(pair["token"])
        self.assertIsNotNone(access)
        self.assertEqual(access["token_type"], "access")
        self.assertEqual(access["sub"], self.employee_id)

        refresh = verify_token(pair["refresh_token"])
        self.assertIsNotNone(refresh)
        self.assertEqual(refresh["token_type"], "refresh")
        self.assertEqual(refresh["sub"], self.employee_id)

        # An access token must not be accepted as a refresh token.
        bad = self.client.post(
            "/api/auth/refresh-token",
            json={"refresh_token": data["token"]},
        )
        self.assertEqual(bad.status_code, 401)

        # Garbage refresh tokens are rejected.
        garbage = self.client.post(
            "/api/auth/refresh-token",
            json={"refresh_token": "not-a-token"},
        )
        self.assertEqual(garbage.status_code, 401)

    def test_token_helpers(self):
        from backend.utils.auth import issue_token, verify_token

        token = issue_token("abc", "user", person_type="employee", display_name="A")
        payload = verify_token(token)
        self.assertEqual(payload["sub"], "abc")
        self.assertEqual(payload["role"], "user")
        self.assertEqual(payload["person_type"], "employee")

        self.assertIsNone(verify_token("garbage"))
        self.assertIsNone(verify_token(""))
        tampered = token[:-1] + ("X" if token[-1] != "X" else "Y")
        self.assertIsNone(verify_token(tampered))


    # -------------------------------------------------- announcements

    def test_announcement_requires_content(self):
        admin = self._auth(self.admin_token)
        res = self.client.post(
            "/api/announcements", json={"content": "   "}, headers=admin
        )
        self.assertEqual(res.status_code, 400)

    def test_announcement_permission_and_publish(self):
        admin = self._auth(self.admin_token)
        user = self._auth(self.user_token)

        # Before allocation a regular user cannot send; admin always can.
        perm = self.client.get("/api/announcements/permission", headers=user)
        self.assertEqual(perm.get_json()["can_send"], False)

        denied = self.client.post(
            "/api/announcements", json={"content": "Nope"}, headers=user
        )
        self.assertEqual(denied.status_code, 403)

        admin_publish = self.client.post(
            "/api/announcements", json={"content": "Admin note"}, headers=admin
        )
        self.assertEqual(admin_publish.status_code, 200)
        self.assertEqual(
            self.client.get("/api/announcements").get_json()["announcement"],
            "Admin note",
        )

        # Allocate the employee and confirm they may now publish.
        self.client.post(
            "/api/announcement-senders",
            json={
                "senders": [
                    {
                        "person_id": self.employee_id,
                        "person_type": "employee",
                        "name": "Integration User",
                    }
                ]
            },
            headers=admin,
        )
        perm = self.client.get("/api/announcements/permission", headers=user)
        self.assertEqual(perm.get_json()["can_send"], True)

        published = self.client.post(
            "/api/announcements", json={"content": "User note"}, headers=user
        )
        self.assertEqual(published.status_code, 200)
        self.assertEqual(
            self.client.get("/api/announcements").get_json()["announcement"],
            "User note",
        )

        # Unauthenticated publishing is always rejected.
        self.client.delete_cookie("psm_access")
        anon = self.client.post("/api/announcements", json={"content": "Anon"})
        self.assertEqual(anon.status_code, 401)

    def test_announcement_senders_roundtrip(self):
        admin = self._auth(self.admin_token)
        res = self.client.post(
            "/api/announcement-senders",
            json={
                "senders": [
                    {
                        "person_id": self.employee_id,
                        "person_type": "employee",
                        "name": "Integration User",
                    }
                ]
            },
            headers=admin,
        )
        self.assertEqual(res.status_code, 200)
        senders = res.get_json()["senders"]
        self.assertEqual(len(senders), 1)
        self.assertEqual(senders[0]["person_id"], self.employee_id)

        fetched = self.client.get("/api/announcement-senders", headers=admin)
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(len(fetched.get_json()["senders"]), 1)


    # -------------------------------------------------- leave management

    def test_leave_submit_and_list(self):
        user = self._auth(self.user_token)
        submit = self.client.post(
            "/api/leave",
            json={
                "person_type": "employee",
                "person_id": self.employee_id,
                "leave_type": "Casual",
                "start_date": "2026-10-01",
                "end_date": "2026-10-02",
                "reason": "Family trip",
            },
            headers=user,
        )
        self.assertEqual(submit.status_code, 201, submit.get_data(as_text=True))
        doc = submit.get_json()["leave_request"]
        self.assertEqual(doc["status"], "pending")
        self.assertEqual(doc["days"], 2)
        self.assertEqual(doc["person_name"], "Integration User")

        listing = self.client.get("/api/leave", headers=user)
        self.assertEqual(listing.status_code, 200)
        payload = listing.get_json()
        self.assertGreaterEqual(payload["stats"]["pending"], 1)
        ids = [r["_id"] for r in payload["requests"]]
        self.assertIn(doc["_id"], ids)

    def test_leave_missing_fields_rejected(self):
        missing = self.client.post("/api/leave", json={"person_id": self.employee_id})
        self.assertEqual(missing.status_code, 400)

        reversed_dates = self.client.post(
            "/api/leave",
            json={
                "person_id": self.employee_id,
                "leave_type": "Sick",
                "start_date": "2026-10-05",
                "end_date": "2026-10-01",
            },
        )
        self.assertEqual(reversed_dates.status_code, 400)

    def test_leave_approval_marks_attendance(self):
        # Submitted through the legacy mobile endpoint, still accepted.
        submit = self.client.post(
            "/api/attendance/leave",
            json={
                "person_type": "employee",
                "person_id": self.employee_id,
                "leave_type": "Annual",
                "start_date": "2026-09-10",
                "end_date": "2026-09-11",
                "reason": "Vacation",
            },
        )
        self.assertEqual(submit.status_code, 201)
        leave_id = submit.get_json()["leave_request"]["_id"]

        admin = self._auth(self.admin_token)
        approve = self.client.post(f"/api/leave/{leave_id}/approve", json={}, headers=admin)
        self.assertEqual(approve.status_code, 200)
        self.assertEqual(approve.get_json()["leave_request"]["status"], "approved")

        # Approved days now read as Leave on the person's attendance.
        summary = self.client.get(
            f"/api/attendance/person/{self.employee_id}/summary"
        ).get_json()
        self.assertGreaterEqual(summary["leave"], 2)

        # A reviewed request cannot be reviewed again.
        again = self.client.post(f"/api/leave/{leave_id}/reject", json={}, headers=admin)
        self.assertEqual(again.status_code, 409)

    def test_leave_review_requires_admin(self):
        submit = self.client.post(
            "/api/leave",
            json={
                "person_type": "employee",
                "person_id": self.employee_id,
                "leave_type": "Sick",
                "start_date": "2026-08-01",
                "end_date": "2026-08-01",
            },
        )
        self.assertEqual(submit.status_code, 201)
        leave_id = submit.get_json()["leave_request"]["_id"]

        self._set_required(True)
        try:
            user = self._auth(self.user_token)
            denied = self.client.post(
                f"/api/leave/{leave_id}/approve", json={}, headers=user
            )
            self.assertEqual(denied.status_code, 403)

            self.client.delete_cookie("psm_access")
            anon = self.client.post(f"/api/leave/{leave_id}/approve", json={})
            self.assertEqual(anon.status_code, 401)
        finally:
            self._set_required(False)


    # -------------------------------------------------- notification inbox

    def test_leave_approval_creates_notification(self):
        user = self._auth(self.user_token)
        submit = self.client.post(
            "/api/leave",
            json={
                "person_type": "employee",
                "person_id": self.employee_id,
                "leave_type": "Casual",
                "start_date": "2026-07-01",
                "end_date": "2026-07-02",
                "reason": "Trip",
            },
            headers=user,
        )
        self.assertEqual(submit.status_code, 201)
        leave_id = submit.get_json()["leave_request"]["_id"]

        admin = self._auth(self.admin_token)
        approve = self.client.post(f"/api/leave/{leave_id}/approve", json={}, headers=admin)
        self.assertEqual(approve.status_code, 200)

        inbox = self.client.get("/api/notifications", headers=user)
        self.assertEqual(inbox.status_code, 200)
        data = inbox.get_json()
        titles = [n["title"] for n in data["notifications"]]
        self.assertTrue(any("approved" in t.lower() for t in titles))
        self.assertGreaterEqual(data["unread"], 1)

    def test_notifications_mark_read(self):
        user = self._auth(self.user_token)
        submit = self.client.post(
            "/api/leave",
            json={
                "person_type": "employee",
                "person_id": self.employee_id,
                "leave_type": "Sick",
                "start_date": "2026-06-01",
                "end_date": "2026-06-01",
            },
            headers=user,
        )
        leave_id = submit.get_json()["leave_request"]["_id"]
        admin = self._auth(self.admin_token)
        self.client.post(f"/api/leave/{leave_id}/reject", json={"note": "Busy"}, headers=admin)

        inbox = self.client.get("/api/notifications", headers=user).get_json()
        target = next(
            (n for n in inbox["notifications"] if "rejected" in n["title"].lower()),
            None,
        )
        self.assertIsNotNone(target)
        self.assertFalse(target["read"])

        mark = self.client.post(f"/api/notifications/{target['_id']}/read", headers=user)
        self.assertEqual(mark.status_code, 200)
        self.assertTrue(mark.get_json()["updated"])

        after = self.client.get("/api/notifications", headers=user).get_json()
        updated = next((n for n in after["notifications"] if n["_id"] == target["_id"]), None)
        self.assertTrue(updated["read"])

    def test_notifications_anonymous_empty(self):
        self.client.delete_cookie("psm_access")
        res = self.client.get("/api/notifications")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["notifications"], [])


if __name__ == "__main__":
    unittest.main()
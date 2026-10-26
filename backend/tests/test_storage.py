"""Tests for the Cloudinary-backed storage layer.

Cloudinary is not reachable from the test environment, so these tests run
against the local-disk fallback. That still proves the important property:
file bodies never land in MongoDB.
"""
import io
import os
import unittest
from unittest import mock

TEST_DB = "psm_test_storage"
ADMIN_USER = "admin"
ADMIN_PASS = "test-pass"

# A tiny but valid PNG (1x1 pixel).
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def _jpeg(width, height):
    """A real JPEG of the given size (no Cloudinary or network needed)."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (12, 96, 180)).save(buffer, format="JPEG")
    return buffer.getvalue()


def setUpModule():
    os.environ["MONGO_DB_NAME"] = TEST_DB
    os.environ["ADMIN_USERNAME"] = ADMIN_USER
    os.environ["ADMIN_PASSWORD"] = ADMIN_PASS
    os.environ["AUTH_REQUIRED"] = "0"
    os.environ["AUTH_SECRET"] = "storage-test-secret"
    os.environ["ENABLE_PUSH"] = "0"
    # Make sure no ambient Cloudinary credentials leak into the tests.
    # Assign empty strings (don't pop): backend.app loads .env with
    # override=False, so an empty value keeps the local-disk fallback active.
    for key in (
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ):
        os.environ[key] = ""


    from pymongo import MongoClient

    cleanup = MongoClient(os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/"))
    cleanup.drop_database(TEST_DB)
    cleanup.close()

    from backend.app import app

    globals()["_app"] = app


def tearDownModule():
    try:
        from backend.db import get_db

        get_db().client.drop_database(TEST_DB)
    except Exception:
        pass


class StorageUrlTests(unittest.TestCase):
    def test_parses_image_delivery_url(self):
        from backend.utils import storage

        parsed = storage.parse_cloudinary_url(
            "https://res.cloudinary.com/demo/image/upload/v1234567890/psm/photos/abc.jpg"
        )
        self.assertEqual(parsed["public_id"], "psm/photos/abc")
        self.assertEqual(parsed["resource_type"], "image")

    def test_parses_raw_delivery_url(self):
        from backend.utils import storage

        parsed = storage.parse_cloudinary_url(
            "https://res.cloudinary.com/demo/raw/upload/v1234567890/psm/documents/abc.pdf"
        )
        self.assertEqual(parsed["public_id"], "psm/documents/abc")
        self.assertEqual(parsed["resource_type"], "raw")

    def test_rejects_non_cloudinary_urls(self):
        from backend.utils import storage

        for url in ("", None, "/uploads/photos/x.jpg", "https://example.com/x.jpg"):
            self.assertIsNone(storage.parse_cloudinary_url(url))

    def test_parses_authenticated_reference(self):
        from backend.utils import storage

        parsed = storage.parse_cloudinary_url("cloudinary://image/psm/photos/abc")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["public_id"], "psm/photos/abc")
        self.assertEqual(parsed["resource_type"], "image")
        self.assertEqual(parsed["delivery_type"], "authenticated")
        self.assertTrue(parsed["reference"])

    def test_parses_signed_authenticated_delivery_url(self):
        from backend.utils import storage

        parsed = storage.parse_cloudinary_url(
            "https://res.cloudinary.com/demo/image/authenticated/"
            "s--iRe1nZLs--/v1/psm/photos/abc"
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["public_id"], "psm/photos/abc")
        self.assertEqual(parsed["resource_type"], "image")
        self.assertEqual(parsed["delivery_type"], "authenticated")
        self.assertFalse(parsed["reference"])

    def test_authenticated_references_are_signed_for_delivery(self):
        from backend.utils import storage

        credentials = {
            "CLOUDINARY_CLOUD_NAME": "demo",
            "CLOUDINARY_API_KEY": "key",
            "CLOUDINARY_API_SECRET": "secret",
        }
        with mock.patch.dict(os.environ, credentials):
            with mock.patch.object(storage, "_configure_cloudinary"):
                with mock.patch(
                    "cloudinary.utils.cloudinary_url",
                    return_value=("https://signed.example/photo", {}),
                ) as build:
                    url = storage.delivery_url("cloudinary://image/psm/photos/abc")

        self.assertEqual(url, "https://signed.example/photo")
        _, kwargs = build.call_args
        self.assertEqual(kwargs["type"], "authenticated")
        self.assertTrue(kwargs["sign_url"])
        self.assertEqual(kwargs["resource_type"], "image")

    def test_download_url_forces_attachment_for_raw_files(self):
        from backend.utils import storage

        url = storage.download_url(
            "https://res.cloudinary.com/demo/raw/upload/v1/psm/documents/abc.pdf",
            "report.pdf",
        )
        self.assertIn("fl_attachment=report.pdf", url)

    def test_upload_falls_back_to_local_disk(self):
        from backend.utils import storage

        asset = storage.upload(
            PNG_BYTES, filename="photo.png", kind=storage.KIND_PHOTOS
        )
        self.assertEqual(asset["storage"], "local")
        self.assertTrue(asset["url"].startswith("/uploads/photos/"))
        self.assertTrue(os.path.isfile(
            os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "uploads",
                "photos",
                asset["public_id"],
            )
        ))


class MediaTokenTests(unittest.TestCase):
    def test_a_signed_path_verifies(self):
        from backend.utils import media_tokens

        signed = media_tokens.sign_path("/uploads/photos/a.jpg")
        self.assertIn("exp=", signed)
        query = dict(
            part.split("=", 1) for part in signed.split("?", 1)[1].split("&")
        )
        self.assertTrue(
            media_tokens.verify_path("/uploads/photos/a.jpg", query["exp"], query["sig"])
        )

    def test_a_tampered_path_is_rejected(self):
        from backend.utils import media_tokens

        signed = media_tokens.sign_path("/uploads/photos/a.jpg")
        query = dict(
            part.split("=", 1) for part in signed.split("?", 1)[1].split("&")
        )
        self.assertFalse(
            media_tokens.verify_path("/uploads/photos/b.jpg", query["exp"], query["sig"])
        )

    def test_an_expired_signature_is_rejected(self):
        from backend.utils import media_tokens

        signed = media_tokens.sign_path("/uploads/photos/a.jpg", ttl=1)
        query = dict(
            part.split("=", 1) for part in signed.split("?", 1)[1].split("&")
        )
        with mock.patch("backend.utils.media_tokens.time.time", return_value=10**12):
            self.assertFalse(
                media_tokens.verify_path(
                    "/uploads/photos/a.jpg", query["exp"], query["sig"]
                )
            )

    def test_cloudinary_references_are_left_alone(self):
        from backend.utils import media_tokens

        ref = "cloudinary://image/psm/photos/a"
        self.assertEqual(media_tokens.sign_path(ref), ref)

    def test_signing_an_already_signed_path_replaces_the_signature(self):
        from backend.utils import media_tokens

        first = media_tokens.sign_path("/uploads/photos/a.jpg", ttl=60)
        second = media_tokens.sign_path(first, ttl=60)
        self.assertEqual(second.count("exp="), 1)
        self.assertEqual(second.count("sig="), 1)
        self.assertTrue(second.startswith("/uploads/photos/a.jpg?"))


class PhotoPathTests(unittest.TestCase):
    def test_signed_local_paths_are_normalized_to_bare_paths(self):
        from backend.utils.photo_utils import normalize_photo_path

        self.assertEqual(
            normalize_photo_path("/uploads/photos/a.jpg?exp=1&sig=abc"),
            "/uploads/photos/a.jpg",
        )

    def test_signed_cloudinary_urls_become_references(self):
        from backend.utils.photo_utils import normalize_photo_path

        signed = (
            "https://res.cloudinary.com/demo/image/authenticated/v1700000000/"
            "psm/photos/abc.jpg?expires_at=1&signature=xyz"
        )
        self.assertEqual(
            normalize_photo_path(signed), "cloudinary://image/psm/photos/abc"
        )

    def test_signature_and_short_version_are_not_public_id(self):
        from backend.utils.photo_utils import normalize_photo_path

        signed = (
            "https://res.cloudinary.com/caiizt91/image/authenticated/"
            "s--iRe1nZLs--/v1/psm/photos/abc"
        )
        self.assertEqual(
            normalize_photo_path(signed), "cloudinary://image/psm/photos/abc"
        )

    def test_photo_fields_cannot_point_at_documents(self):
        from backend.utils.photo_utils import normalize_photo_path

        self.assertEqual(
            normalize_photo_path("/uploads/documents/secret.pdf"), ""
        )
        self.assertEqual(
            normalize_photo_path("/uploads/photos/../documents/secret.pdf"), ""
        )


class ImageOptimizationTests(unittest.TestCase):
    def test_wide_images_are_downscaled(self):
        from PIL import Image

        from backend.utils.uploads import optimize_image

        original = _jpeg(3000, 2000)
        optimized, mime = optimize_image(original, "image/jpeg")

        self.assertEqual(mime, "image/jpeg")
        self.assertLess(len(optimized), len(original))
        with Image.open(io.BytesIO(optimized)) as image:
            self.assertEqual(image.width, 1200)
            self.assertEqual(image.height, 800)

    def test_small_images_are_left_untouched(self):
        from backend.utils.uploads import optimize_image

        original = _jpeg(320, 240)
        optimized, mime = optimize_image(original, "image/jpeg")
        self.assertEqual(optimized, original)
        self.assertEqual(mime, "image/jpeg")

    def test_non_images_are_left_untouched(self):
        from backend.utils.uploads import optimize_image

        optimized, mime = optimize_image(PDF_BYTES, "application/pdf")
        self.assertEqual(optimized, PDF_BYTES)
        self.assertEqual(mime, "application/pdf")

    def test_uploaded_photo_is_stored_at_the_resized_size(self):
        from backend.utils import storage

        original = _jpeg(2400, 1600)
        asset = storage.upload(
            original, filename="big.jpg", kind=storage.KIND_PHOTOS,
            resource_type="image", content_type="image/jpeg",
        )
        self.assertLess(asset["bytes"], len(original))

        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            asset["url"].lstrip("/").replace("/", os.sep),
        )
        with open(path, "rb") as handle:
            stored = handle.read()
        self.assertLess(len(stored), len(original))

        from PIL import Image

        with Image.open(io.BytesIO(stored)) as image:
            self.assertEqual(image.width, 1200)

        storage.delete(asset["url"])


class DatabaseTargetTests(unittest.TestCase):
    def test_the_client_follows_the_configured_database(self):
        from backend.db import get_db

        original = os.environ.get("MONGO_DB_NAME", "")
        scratch = "psm_test_storage_other"
        try:
            os.environ["MONGO_DB_NAME"] = scratch
            self.assertEqual(get_db().name, scratch)
            os.environ["MONGO_DB_NAME"] = TEST_DB
            self.assertEqual(get_db().name, TEST_DB)
        finally:
            if original:
                os.environ["MONGO_DB_NAME"] = original
            else:
                os.environ.pop("MONGO_DB_NAME", None)
            try:
                get_db().client.drop_database(scratch)
            except Exception:
                pass


class MongoUriTests(unittest.TestCase):
    """The connection string is built so pymongo can actually parse it."""

    def test_a_raw_at_sign_in_the_password_is_escaped(self):
        from backend import config

        raw = "mongodb+srv://user:pa@ss@cluster0.example.mongodb.net/?retryWrites=true"
        with mock.patch.dict(os.environ, {"MONGO_URI": raw}):
            self.assertEqual(
                config.mongo_uri(),
                "mongodb+srv://user:pa%40ss@cluster0.example.mongodb.net/?retryWrites=true",
            )

    def test_already_encoded_credentials_are_not_encoded_twice(self):
        from backend import config

        raw = "mongodb+srv://user:pa%40ss@cluster0.example.mongodb.net/"
        with mock.patch.dict(os.environ, {"MONGO_URI": raw}):
            self.assertEqual(
                config.mongo_uri(),
                "mongodb+srv://user:pa%40ss@cluster0.example.mongodb.net/",
            )

    def test_a_plain_uri_is_left_untouched(self):
        from backend import config

        raw = "mongodb://127.0.0.1:27017/"
        with mock.patch.dict(os.environ, {"MONGO_URI": raw}):
            self.assertEqual(config.mongo_uri(), raw)

    def test_the_escaped_uri_is_accepted_by_pymongo(self):
        from pymongo.uri_parser import parse_uri

        from backend import config

        # A plain "mongodb://" host is used here on purpose: parsing an
        # "mongodb+srv://" URI triggers a live DNS lookup.
        raw = "mongodb://user:Maniyarasan@09@db.example.com:27017/psm"
        with mock.patch.dict(os.environ, {"MONGO_URI": raw}):
            parsed = parse_uri(config.mongo_uri())
        self.assertEqual(parsed["username"], "user")
        self.assertEqual(parsed["password"], "Maniyarasan@09")


class CloudinaryBackendTests(unittest.TestCase):
    """The Cloudinary path, exercised against a mocked SDK."""

    def setUp(self):
        from unittest import mock

        self.mock = mock
        self.env = mock.patch.dict(os.environ, {
            "CLOUDINARY_CLOUD_NAME": "demo",
            "CLOUDINARY_API_KEY": "key",
            "CLOUDINARY_API_SECRET": "secret",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def _fake_upload(self, payload, **options):
        self.upload_options = options
        self.uploaded_bytes = payload.read()
        public_id = options["public_id"]
        folder = options.get("folder", "")
        resource_type = options.get("resource_type", "image")
        cloudinary_public_id = public_id
        full_public_id = f"{folder}/{public_id}" if folder else public_id
        return {
            "public_id": full_public_id,
            "resource_type": resource_type,
            "secure_url": (
                f"https://res.cloudinary.com/demo/{resource_type}/upload/"
                f"v1700000000/{full_public_id}.jpg"
            ),
            "bytes": len(self.uploaded_bytes),
        }

    def test_upload_uses_the_configured_folder_and_returns_a_private_reference(self):
        from cloudinary import uploader

        from backend.utils import storage

        with self.mock.patch.object(uploader, "upload", side_effect=self._fake_upload):
            asset = storage.upload(
                PNG_BYTES, filename="photo.png", kind=storage.KIND_PHOTOS,
                resource_type="image", content_type="image/png",
            )

        self.assertEqual(asset["storage"], "cloudinary")
        self.assertEqual(asset["delivery_type"], "authenticated")
        self.assertTrue(asset["url"].startswith("cloudinary://image/"))
        self.assertEqual(self.upload_options["folder"], "psm/photos")
        self.assertEqual(self.upload_options["resource_type"], "image")
        self.assertEqual(self.upload_options["type"], "authenticated")
        self.assertNotIn("eager", self.upload_options)

    def test_the_returned_url_can_be_parsed_back_for_deletion(self):
        from cloudinary import uploader

        from backend.utils import storage

        with self.mock.patch.object(uploader, "upload", side_effect=self._fake_upload):
            asset = storage.upload(
                PNG_BYTES, filename="photo.png", kind=storage.KIND_PHOTOS,
                resource_type="image", content_type="image/png",
            )

        parsed = storage.parse_cloudinary_url(asset["url"])
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["public_id"], asset["public_id"])
        self.assertTrue(parsed["public_id"].startswith("psm/photos/"))
        self.assertEqual(parsed["resource_type"], "image")
        self.assertEqual(parsed["delivery_type"], "authenticated")

    def test_a_failed_eager_transformation_falls_back_to_a_plain_upload(self):
        from cloudinary import uploader

        from backend.utils import storage

        calls = []

        def fake_upload(payload, **options):
            calls.append(options)
            if "eager" in options:
                raise RuntimeError("Transformation credits exceeded")
            return self._fake_upload(payload, **options)

        with self.mock.patch.dict(os.environ, {"CLOUDINARY_EAGER_IMAGES": "1"}):
            with self.mock.patch.object(uploader, "upload", side_effect=fake_upload):
                asset = storage.upload(
                    PNG_BYTES, filename="photo.png", kind=storage.KIND_PHOTOS,
                    resource_type="image", content_type="image/png",
                )

        self.assertEqual(len(calls), 2)
        self.assertIn("eager", calls[0])
        self.assertNotIn("eager", calls[1])
        self.assertEqual(asset["storage"], "cloudinary")
        self.assertTrue(asset["url"].startswith("cloudinary://image/"))


class StorageIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = _app
        cls.client = cls.app.test_client()
        res = cls.client.post(
            "/api/auth/admin-login",
            json={"username": ADMIN_USER, "password": ADMIN_PASS},
        )
        assert res.status_code == 200, res.get_data(as_text=True)
        cls.token = res.get_json()["token"]
        cls.headers = {"Authorization": f"Bearer {cls.token}"}

    def _upload_document(self, data=PDF_BYTES, name="offer.pdf"):
        return self.client.post(
            "/api/documents/upload",
            data={
                "file": (io.BytesIO(data), name),
                "category": "Offer Letter",
            },
            headers=self.headers,
            content_type="multipart/form-data",
        )

    def test_document_upload_does_not_store_the_body_in_mongo(self):
        from backend.db import get_db

        res = self._upload_document()
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        doc_id = res.get_json()["_id"]

        doc = get_db().documents.find_one({"file_name": "offer.pdf"})
        self.assertNotIn("file_data_base64", doc)
        self.assertTrue(doc["file_path"])

        listing = self.client.get("/api/documents", headers=self.headers)
        self.assertEqual(listing.status_code, 200)
        for item in listing.get_json():
            self.assertNotIn("file_data_base64", item)

        self.client.delete(f"/api/documents/{doc_id}", headers=self.headers)

    def test_document_download_redirects_to_the_stored_file(self):
        res = self._upload_document()
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        doc_id = res.get_json()["_id"]

        download = self.client.get(
            f"/api/documents/{doc_id}/download", headers=self.headers
        )
        self.assertEqual(download.status_code, 302)
        self.assertTrue(
            download.headers["Location"].split("?")[0].startswith("/uploads/documents/")
        )

        self.client.delete(f"/api/documents/{doc_id}", headers=self.headers)

    def test_document_delete_removes_the_stored_file(self):
        from backend.utils import storage

        res = self._upload_document()
        doc_id = res.get_json()["_id"]
        path = res.get_json()["file_url"].split("?")[0]
        file_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            path.lstrip("/").replace("/", os.sep),
        )
        self.assertTrue(os.path.isfile(file_path))

        deleted = self.client.delete(f"/api/documents/{doc_id}", headers=self.headers)
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(os.path.isfile(file_path))
        self.assertFalse(storage.is_cloudinary_url(path))

    def test_profile_photo_upload_returns_a_stored_url(self):
        res = self.client.post(
            "/api/upload/profile",
            data={"photo": (io.BytesIO(PNG_BYTES), "me.png")},
            headers=self.headers,
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        path = res.get_json()["photo_path"]
        self.assertTrue(path.split("?")[0].startswith("/uploads/photos/"))

        # Raw media paths are private; only the signed URL in the response works.
        # Use a fresh client so the admin session cookie cannot authorize it.
        unsigned = path.split("?")[0]
        anonymous = self.app.test_client()
        self.assertEqual(anonymous.get(unsigned).status_code, 401)
        self.assertEqual(anonymous.get(path).status_code, 200)

    def test_support_attachment_is_stored_outside_mongo(self):
        from backend.db import get_db

        person = self.client.post(
            "/api/employees",
            json={
                "employee_id": "ST001",
                "name": "Storage Tester",
                "status": "Active",
                "password": "user-pass",
            },
            headers=self.headers,
        )
        self.assertEqual(person.status_code, 201, person.get_data(as_text=True))
        person_id = person.get_json()["_id"]

        res = self.client.post(
            "/api/support/requests",
            data={
                "person_id": person_id,
                "person_type": "employee",
                "category": "General",
                "subject": "Storage test",
                "description": "Attachment should not live in MongoDB",
                "files": (io.BytesIO(PNG_BYTES), "proof.png"),
            },
            headers=self.headers,
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        ticket = res.get_json()["ticket"]
        attachment = ticket["attachments"][0]
        self.assertNotIn("file_data_base64", attachment)
        self.assertTrue(attachment["file_url"])

        stored = get_db().support_tickets.find_one({"ticket_number": ticket["ticket_number"]})
        self.assertNotIn("file_data_base64", stored["attachments"][0])

        download = self.client.get(
            f"/api/support/attachments/{attachment['attachment_id']}/download",
            headers=self.headers,
        )
        self.assertEqual(download.status_code, 302)
        self.assertTrue(
            download.headers["Location"].split("?")[0].startswith("/uploads/attachments/")
        )

    def test_ttl_indexes_are_created(self):
        from backend.db import get_db

        db = get_db()
        notifications = db.notifications.index_information()
        self.assertIn("ttl_notifications", notifications)
        activity = db.activity_log.index_information()
        self.assertIn("ttl_activity_log", activity)
        resets = db.password_resets.index_information()
        self.assertIn("ttl_password_resets", resets)

    def test_storage_stats_endpoint_reports_the_media_backend(self):
        res = self.client.get("/api/storage", headers=self.headers)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertIn("media", payload)
        self.assertIn("collections", payload)


if __name__ == "__main__":
    unittest.main()

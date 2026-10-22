# psm-office

Monorepo for the PSM Office Manager: a Flask API, an admin React panel, a
mobile web client and an Expo app.

```
backend/     Flask API (MongoDB + Cloudinary)
frontend/    Admin panel (React + Vite)
mobile-web/  Mobile web client (React)
mobile/      Expo app
scripts/     Repository helper scripts
```

## Media lives in Cloudinary, not in MongoDB

Every image, document and attachment is stored in **Cloudinary**. MongoDB only
ever holds the metadata (a URL, a filename, a size). This is what keeps the
MongoDB Atlas free tier (M0) comfortable - the file bodies were by far the
largest thing in the database.

Measured on the development database before the migration:

| Collection | Size | Share |
| ---------- | ---- | ----- |
| `photos` (base64 images) | 1572 KB | 69% |
| `documents` (base64 files) | 673 KB | 30% |
| everything else | 19 KB | 1% |
| **total** | **2264 KB** | |

After migrating, the same data is **~19 KB** of metadata. The files are served
straight from the Cloudinary CDN, so the API never proxies file bytes.

### How it works

- `backend/utils/storage.py` - the single place that writes a file. It uploads
  to Cloudinary and returns a descriptor (`url`, `public_id`, `bytes`, ...).
  When no credentials are configured it falls back to local disk under
  `backend/uploads/`, so development keeps working offline.
- `backend/utils/uploads.py` - validates the upload (size cap, extension
  allowlist, magic-byte sniffing) and downscales images before they are
  stored.
- MongoDB stores `file_path` / `photo_path` / `file_url` - a delivery URL - and
  never the bytes.
- Downloads and previews are 302 redirects to the CDN, so the API stays out of
  the data path.

### Images are resized before upload

Photos are scaled down to `CLOUDINARY_IMAGE_MAX_WIDTH` (1200 px) and
re-encoded with Pillow **before** the upload. That keeps the media library and
the bandwidth it serves small, and it spends none of the account's
transformation credits (the free plan grants very few). Set
`CLOUDINARY_EAGER_IMAGES=1` if you would rather have Cloudinary produce the
resized derivative.

## Setup

### 1. Cloudinary

Create a free account at <https://cloudinary.com>, then copy **Cloud name**,
**API key** and **API secret** from the *Product Environment* dashboard.

Add them to `backend/.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_FOLDER=psm
```

The backend logs which backend it is using on startup, and `GET /api/health`
reports it:

```json
{ "status": "ok", "database": true, "storage": { "backend": "cloudinary", "cloudinary": "your-cloud-name", "folder": "psm" } }
```

If the credentials are missing the backend logs a warning and stores files on
local disk instead. Set `REQUIRE_CLOUDINARY=1` in production to refuse to
start without them.

To check the credentials end to end (it uploads a real image and a real
document, then deletes both again):

```bash
python -m backend.scripts.test_cloudinary
```

### 2. MongoDB Atlas

```dotenv
MONGO_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=psm_office_manager
```

Keep `MONGO_MAX_POOL_SIZE` small (default 10) - the free tier caps concurrent
connections per cluster.

If the password contains a reserved character (`@ : / ? # [ ] %`), percent-encode
it (`pa@ss` becomes `pa%40ss`). An unencoded `@` makes pymongo reject the whole
URI with `InvalidURI` and the backend silently falls back to "no database". The
backend escapes the credentials for you, but encoding them keeps the value
copy-pasteable from the Atlas dashboard.

Check the connection end to end:

```bash
python -m backend.scripts.test_mongodb
```

It verifies the connection string, the TLS handshake, authentication, a
write/read round-trip, index creation and the current database size.

### 3. Run it

```bash
pip install -r backend/requirements.txt
python -m backend.app          # development server on :5000
```

## Moving the existing files out of MongoDB

The migration script uploads every file body that is still inside MongoDB,
repoints the rows at the CDN and drops the base64 columns. It is idempotent,
so it is safe to re-run after an interruption.

```bash
# Preview first - changes nothing.
python -m backend.scripts.migrate_to_cloudinary --dry-run

# Then run it for real.
python -m backend.scripts.migrate_to_cloudinary
```

It handles four kinds of leftovers:

| Source | What it does |
| ------ | ------------ |
| `photos` collection | Uploads each base64 image, repoints `employees` / `interns` / `attendance`, then drops the collection |
| `data:` URLs in `photo_path` | Uploads the inline image and rewrites the row |
| `documents.file_data_base64` | Uploads the file and unsets the column |
| `support_tickets` attachments | Uploads each attachment and drops its base64 copy |

Back up the database first (`POST /api/backup`).

## Keeping the database small

- `GET /api/storage` (admin) reports the footprint per collection plus the
  media backend in use.
- Notifications, the activity feed and password-reset codes expire on their
  own via TTL indexes - see `NOTIFICATION_TTL_DAYS`, `ACTIVITY_LOG_TTL_DAYS`
  and `LEGACY_PHOTO_TTL_DAYS` in `backend/.env.example`.
- Photo upload routes validate the type and size before anything is stored.

## Tests

```bash
python -m pytest backend/tests/ -q
```

The storage tests run against the local-disk fallback (Cloudinary is not
reachable from the test environment); they still prove the important
property - file bodies never land in MongoDB.

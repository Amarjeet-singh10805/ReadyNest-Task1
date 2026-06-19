# FormBuilder — Dynamic Form Builder

A fullstack web application for creating, customizing, and sharing dynamic forms, collecting responses in real time, and managing them with built-in analytics.

**Stack:** HTML/CSS/vanilla JS (frontend) · Python/Flask (backend) · MySQL (database)

---

## Features

- **User authentication** — register/login with hashed passwords and JWT-based sessions
- **Drag-and-drop form builder** — text, email, number, phone, date, textarea, checkbox, radio, dropdown, URL fields
- **Form management** — create, edit, duplicate, delete, publish/unpublish
- **Unique shareable links** — every form gets a public URL like `/form/<token>`
- **Real-time response collection** — public form submissions are stored instantly
- **Response dashboard** — view, search, and filter responses by keyword or date
- **Analytics** — total views, total submissions, completion rate, submissions-over-time chart
- **Export** — download responses as CSV or Excel (.xlsx)
- **Zero-step database setup** — the app creates its own database and tables automatically on first boot; you never have to run `mysql < schema.sql` by hand on most platforms (see "How database setup works" below)

---

## Project Structure

```
formapp/
├── backend/
│   ├── app.py                 # Flask app entry point (serves API + frontend)
│   ├── wsgi.py                 # Production WSGI entry point (for gunicorn)
│   ├── config.py               # Environment-based configuration
│   ├── db.py                   # MySQL connection pool + auto schema setup
│   ├── requirements.txt
│   ├── .env.example             # Copy to .env and fill in your secrets
│   ├── routes/
│   │   ├── auth.py             # Register / login / profile
│   │   ├── forms.py            # Form CRUD + builder persistence
│   │   ├── public.py           # Public form view + submission (no auth)
│   │   └── responses.py        # Response dashboard, analytics, export
│   └── utils/
│       ├── auth.py             # Password hashing, JWT helpers, @token_required
│       └── validators.py       # Input validation
├── frontend/
│   ├── index.html               # Landing page
│   ├── login.html / register.html
│   ├── dashboard.html           # List/manage forms
│   ├── builder.html             # Drag-and-drop form builder
│   ├── responses.html           # Response dashboard + analytics
│   ├── form.html                # Public form-filling page (the shared link)
│   ├── css/
│   └── js/
├── database/
│   └── schema.sql               # MySQL schema (applied automatically on startup)
├── setup.sh                      # One-command local setup script
├── Procfile                      # For Render/Heroku-style deploys
├── Dockerfile                     # For containerized deploys
├── docker-compose.yml              # Local app + MySQL together
├── runtime.txt                     # Python version pin for buildpack platforms
├── .dockerignore
└── .gitignore
```

---

## 1. Local Setup

### Prerequisites
- Python 3.10+
- MySQL 8.0+ (or MariaDB 10.5+), reachable and running
- pip

### The fast way

```bash
./setup.sh
```

This generates `backend/.env` with random secret keys, installs dependencies, and starts the app. The app creates its own database and tables automatically the first time it boots — there's no separate schema step to run. Edit `backend/.env` if your MySQL isn't on `localhost` with the `root` user and no password.

### The manual way

**Step 1 — Configure environment variables**

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set at minimum:
- `DB_PASSWORD` (and `DB_HOST`/`DB_USER`/`DB_NAME` if they differ from the defaults)
- `SECRET_KEY` and `JWT_SECRET_KEY` — generate random strings, e.g. `python3 -c "import secrets; print(secrets.token_hex(32))"`

**Step 2 — Install dependencies**

```bash
pip install -r requirements.txt
```

If you're on a system that blocks global pip installs (Debian/Ubuntu), use:
```bash
pip install -r requirements.txt --break-system-packages
```
or set up a virtual environment first:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Step 3 — Run the app**

```bash
python3 app.py
```

Visit **http://localhost:5000** — the Flask app serves both the API and the frontend, so there's nothing else to start. On first boot you'll see a `[db] Schema verified/applied successfully` log line; that's the app creating the database and tables for you.

### How database setup works (and when you'd still run schema.sql by hand)

On every startup, the app connects to MySQL using your configured credentials, creates the target database if it doesn't exist (`CREATE DATABASE IF NOT EXISTS`), and applies every table definition in `database/schema.sql` (`CREATE TABLE IF NOT EXISTS`). Both operations are safe to repeat — restarting the app never wipes or duplicates data.

You'd only need to run `database/schema.sql` manually if your database user lacks `CREATE DATABASE`/`CREATE TABLE` privileges (common on some locked-down managed databases) — in that case, ask your provider to run it once, or do it yourself with whatever admin access you do have:
```bash
mysql -u <user> -p <your_db_name> < database/schema.sql
```

---

## 2. Deploying to Production

The app is structured so the **same Flask server serves the API and the static frontend** — there is only one process to deploy. The database schema is applied automatically on first boot, so in most cases the only manual database step is creating the MySQL instance itself and pointing the app's environment variables at it.

### Option A: Render.com (recommended — easiest, has managed MySQL alternative)

Render doesn't offer managed MySQL on the free tier; you can use a managed MySQL provider (e.g. **Railway**, **PlanetScale**, **Aiven**, or **AWS RDS**) and point `DB_HOST` etc. to it.

1. Push this project to a GitHub repo.
2. On Render: **New → Web Service** → connect your repo.
3. Build command: `pip install -r backend/requirements.txt`
4. Start command: `gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:application --chdir backend --preload --timeout 120`
5. Add environment variables from `.env.example` (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, SECRET_KEY, JWT_SECRET_KEY, APP_BASE_URL — set this to your Render URL, CORS_ORIGINS — same URL).
6. Deploy. The app creates the database/tables itself on first boot — watch the deploy logs for `[db] Schema verified/applied successfully`.

### Option B: Railway.app (gives you MySQL + app hosting together)

1. Create a new Railway project.
2. Add a **MySQL** plugin/database — Railway gives you connection details automatically.
3. Deploy this repo as a service. Set the start command:
   ```
   gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:application --chdir backend --preload --timeout 120
   ```
4. Map Railway's MySQL variables to the names this app expects (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) in the service's environment settings.
5. Set `SECRET_KEY`, `JWT_SECRET_KEY`, `APP_BASE_URL` (your Railway public URL), and `CORS_ORIGINS` (same URL).
6. Deploy — the schema is applied automatically against whatever database Railway provisioned, whatever it's named.

### Option C: A VPS (DigitalOcean / Linode / AWS EC2 / etc.)

1. Install MySQL, Python 3, and pip on the server.
2. Clone the repo, set up `.env` as in local setup (use real production secrets).
3. `pip install -r backend/requirements.txt`
4. Run with gunicorn behind Nginx:
   ```bash
   cd backend
   gunicorn -w 4 -b 127.0.0.1:5000 wsgi:application --preload --timeout 120
   ```
   The schema is created automatically on this first run.
5. Use Nginx as a reverse proxy to port 5000, and set up HTTPS with Certbot.
6. Use `systemd` or `supervisor` to keep the gunicorn process alive across reboots.

### Option D: Docker

This repo includes a ready-to-use `Dockerfile`:
```bash
docker build -t FormBuilder .
docker run -p 5000:5000 \
  -e DB_HOST=your-mysql-host -e DB_USER=root -e DB_PASSWORD=yourpass -e DB_NAME=form_builder_db \
  -e SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))") \
  -e JWT_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))") \
  -e APP_BASE_URL=https://yourapp.com \
  FormBuilder
```
Pair this with a managed MySQL instance (don't run MySQL in the same ephemeral container in production).

### Option E: Docker Compose (easiest way to run everything locally, including MySQL)

This repo includes a `docker-compose.yml` that spins up both the app and a MySQL database together.

```bash
docker compose up --build
```

Visit **http://localhost:5000**. To customize secrets, create a `.env` file in the project root (same folder as `docker-compose.yml`) with `DB_PASSWORD`, `SECRET_KEY`, `JWT_SECRET_KEY`, etc. — docker-compose will pick them up automatically.

---

## 3. Important Production Notes

- **Never commit `.env`** — it's already in `.gitignore` and `.dockerignore`. Set environment variables through your hosting platform's dashboard instead.
- **Change `SECRET_KEY` and `JWT_SECRET_KEY`** to long random values in production — the app will print a `[SECURITY WARNING]` at startup if it detects you're still using the example defaults outside of `FLASK_ENV=development`.
- **`APP_BASE_URL` is optional but recommended.** If you don't set it, the app derives the share-link base URL from each incoming request automatically, so share links still work — but setting it explicitly to your real domain is more predictable, especially behind proxies/load balancers.
- **Set `CORS_ORIGINS`** to your real domain(s) for production. `CORS_ORIGINS=*` is supported for quick testing but isn't recommended once you have a real domain. Note this only affects cross-origin API calls — the bundled frontend talks to the API same-origin regardless.
- **Use HTTPS** in production — most platforms (Render, Railway) provide this automatically.
- **Use the `/api/health` endpoint** for your platform's health checks — it verifies actual database connectivity, not just that the process is alive, and returns HTTP 503 if the database is unreachable.
- This app uses `gunicorn` as the production WSGI server — never run `python3 app.py` in production, since Flask's built-in server is for development only. Always include `--preload` in your gunicorn command (already set in the Procfile and Dockerfile here) — without it, every worker process re-runs the database setup independently on startup, which is harmless but wasteful and noisy in logs.

---

## 4. How Sharing Works

When a form is created, the backend generates a random `share_token` and a `share_url` like:
```
https://yourapp.com/form/<token>
```
That URL redirects to `/form.html?token=<token>`, which is the public, unauthenticated form-filling page. Anyone with the link can view and submit the form (as long as it's published and accepting responses) — no login required.

---

## 5. API Overview

All endpoints are prefixed with `/api`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create an account |
| POST | `/auth/login` | No | Log in, returns JWT |
| GET | `/auth/me` | Yes | Get current user profile |
| POST | `/forms` | Yes | Create a form with fields |
| GET | `/forms` | Yes | List your forms (supports `?search=`) |
| GET | `/forms/<id>` | Yes | Get a form + its fields |
| PUT | `/forms/<id>` | Yes | Update a form + replace its fields |
| DELETE | `/forms/<id>` | Yes | Delete a form |
| POST | `/forms/<id>/duplicate` | Yes | Duplicate a form |
| GET | `/public/forms/<token>` | No | Get a published form for filling (logs a view) |
| POST | `/public/forms/<token>/submit` | No | Submit a response |
| GET | `/forms/<id>/responses` | Yes | List responses (supports `?search=`, `?date_from=`, `?date_to=`) |
| DELETE | `/forms/<id>/responses/<rid>` | Yes | Delete a response |
| GET | `/forms/<id>/analytics` | Yes | Views, submissions, completion rate, daily chart data |
| GET | `/forms/<id>/export?format=csv\|xlsx` | Yes | Download responses |
| GET | `/health` | No | Platform health check at `/api/health` — verifies DB connectivity, returns 503 if unreachable |

Authenticated requests need `Authorization: Bearer <token>`.

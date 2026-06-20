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
│   ├── .env
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
├── Procfile                      # For Render/Heroku-style deploys
├── runtime.txt                     # Python version pin for buildpack platforms
└── .gitignore


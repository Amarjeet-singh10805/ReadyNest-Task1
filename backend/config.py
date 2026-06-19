"""
Application configuration loaded from environment variables.
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "ag123fklmno564df")

    # JWT
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "mga12ytgf234g")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        hours=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_HOURS", 24))
    )

    # MySQL
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = int(os.environ.get("DB_PORT", 3306))
    DB_USER = os.environ.get("DB_USER", "root")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
    DB_NAME = os.environ.get("DB_NAME", "form_builder_db")

    # CORS — only relevant if you call the API from a different origin than
    # where this app is hosted (e.g. a separately-deployed frontend, or a
    # mobile app). Since this app serves its own frontend from the same
    # origin, same-origin requests work regardless of this setting.
    # Set CORS_ORIGINS="*" to allow any origin (fine for quick testing,
    # not recommended once you have real users), or a comma-separated list
    # of allowed origins for production.
    CORS_ORIGINS = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5000,http://127.0.0.1:5000"
    ).split(",")

    # App
    APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:5000")
    PORT = int(os.environ.get("PORT", 5000))
    DEBUG = os.environ.get("FLASK_ENV", "production") == "development"

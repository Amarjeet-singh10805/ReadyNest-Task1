"""
Authentication helpers: password hashing and JWT token management.
"""
import jwt
import secrets
import string
from datetime import datetime, timezone
from functools import wraps
from flask import request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash


def hash_password(password):
    return generate_password_hash(password)


def verify_password(password, password_hash):
    return check_password_hash(password_hash, password)


def generate_token(user_id, email):
    """Generate a JWT access token for a user."""
    payload = {
        "user_id": user_id,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + current_app.config["JWT_ACCESS_TOKEN_EXPIRES"],
    }
    token = jwt.encode(payload, current_app.config["JWT_SECRET_KEY"], algorithm="HS256")
    return token


def decode_token(token):
    """Decode and validate a JWT token. Raises jwt exceptions on failure."""
    payload = jwt.decode(
        token, current_app.config["JWT_SECRET_KEY"], algorithms=["HS256"]
    )
    return payload


def generate_share_token(length=12):
    """Generate a random URL-safe token for sharing forms publicly."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def token_required(f):
    """
    Decorator for protected routes. Reads 'Authorization: Bearer <token>'
    header, validates it, and injects current_user_id as first arg.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()

        if not token:
            return jsonify({"success": False, "message": "Authentication token is missing"}), 401

        try:
            payload = decode_token(token)
            current_user_id = payload["user_id"]
        except jwt.ExpiredSignatureError:
            return jsonify({"success": False, "message": "Token has expired, please log in again"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"success": False, "message": "Invalid authentication token"}), 401

        return f(current_user_id, *args, **kwargs)

    return decorated

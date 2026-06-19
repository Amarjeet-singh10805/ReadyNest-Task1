"""
Authentication routes: register, login, current user profile.
"""
from flask import Blueprint, request, jsonify
from db import execute_query
from utils.auth import hash_password, verify_password, generate_token, token_required
from utils.validators import validate_registration, validate_login

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    errors = validate_registration(data)
    if errors:
        return jsonify({"success": False, "message": "; ".join(errors)}), 400

    name = data["name"].strip()
    email = data["email"].strip().lower()
    password = data["password"]

    existing = execute_query(
        "SELECT id FROM users WHERE email = %s", (email,), fetch_one=True
    )
    if existing:
        return jsonify({"success": False, "message": "An account with this email already exists"}), 409

    password_hash = hash_password(password)
    user_id = execute_query(
        "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
        (name, email, password_hash),
        commit=True,
    )

    token = generate_token(user_id, email)
    return jsonify({
        "success": True,
        "message": "Account created successfully",
        "token": token,
        "user": {"id": user_id, "name": name, "email": email},
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    errors = validate_login(data)
    if errors:
        return jsonify({"success": False, "message": "; ".join(errors)}), 400

    email = data["email"].strip().lower()
    password = data["password"]

    user = execute_query(
        "SELECT id, name, email, password_hash FROM users WHERE email = %s",
        (email,),
        fetch_one=True,
    )

    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"success": False, "message": "Invalid email or password"}), 401

    token = generate_token(user["id"], user["email"])
    return jsonify({
        "success": True,
        "message": "Logged in successfully",
        "token": token,
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]},
    }), 200


@auth_bp.route("/me", methods=["GET"])
@token_required
def get_profile(current_user_id):
    user = execute_query(
        "SELECT id, name, email, created_at FROM users WHERE id = %s",
        (current_user_id,),
        fetch_one=True,
    )
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    user["created_at"] = user["created_at"].isoformat() if user["created_at"] else None
    return jsonify({"success": True, "user": user}), 200

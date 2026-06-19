"""
Form management routes: create, list, get, update, delete forms,
plus the drag-and-drop builder field persistence.
"""
import json
import os
from flask import Blueprint, request, jsonify, current_app
from db import execute_query, get_connection
from utils.auth import token_required, generate_share_token
from utils.validators import validate_form_fields

forms_bp = Blueprint("forms", __name__, url_prefix="/api/forms")


def _get_base_url():
    """
    Build the public base URL used for share links.

    Prefers the explicit APP_BASE_URL env var when it's been set to
    something other than the local-dev default — this matters because on
    most hosting platforms (Render, Railway, etc.) the app doesn't always
    know its own public HTTPS domain from the request alone, especially
    behind a proxy. Falls back to deriving it from the incoming request
    (request.host_url) so share links still work correctly even if someone
    forgets to set APP_BASE_URL after deploying.
    """
    configured = current_app.config.get("APP_BASE_URL", "")
    if configured and configured.rstrip("/") not in ("http://localhost:5000", ""):
        return configured.rstrip("/")
    return request.host_url.rstrip("/")


def _serialize_form(form):
    if form.get("created_at"):
        form["created_at"] = form["created_at"].isoformat()
    if form.get("updated_at"):
        form["updated_at"] = form["updated_at"].isoformat()
    form["is_published"] = bool(form.get("is_published"))
    form["accepts_responses"] = bool(form.get("accepts_responses"))
    return form


def _serialize_field(field):
    if isinstance(field.get("options"), str):
        try:
            field["options"] = json.loads(field["options"]) if field["options"] else []
        except (json.JSONDecodeError, TypeError):
            field["options"] = []
    if isinstance(field.get("validation"), str):
        try:
            field["validation"] = json.loads(field["validation"]) if field["validation"] else {}
        except (json.JSONDecodeError, TypeError):
            field["validation"] = {}
    field["is_required"] = bool(field.get("is_required"))
    return field


def _save_fields(cursor, form_id, fields):
    """Replace all fields for a form with the new list (used by create/update)."""
    cursor.execute("DELETE FROM form_fields WHERE form_id = %s", (form_id,))
    for idx, field in enumerate(fields):
        cursor.execute(
            """INSERT INTO form_fields
               (form_id, field_type, label, placeholder, is_required, field_order, options, validation)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                form_id,
                field["field_type"],
                field["label"].strip(),
                field.get("placeholder", ""),
                bool(field.get("is_required", False)),
                field.get("field_order", idx),
                json.dumps(field.get("options", [])),
                json.dumps(field.get("validation", {})),
            ),
        )


@forms_bp.route("", methods=["POST"])
@token_required
def create_form(current_user_id):
    """Create a new form with its fields (from the drag-and-drop builder)."""
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    fields = data.get("fields", [])
    theme_color = data.get("theme_color", "#6366f1")

    if not title:
        return jsonify({"success": False, "message": "Form title is required"}), 400

    field_errors = validate_form_fields(fields)
    if field_errors:
        return jsonify({"success": False, "message": "; ".join(field_errors)}), 400

    share_token = generate_share_token()

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO forms (user_id, title, description, share_token, theme_color, is_published)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (current_user_id, title, description, share_token, theme_color, True),
        )
        form_id = cursor.lastrowid
        _save_fields(cursor, form_id, fields)
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

    return jsonify({
        "success": True,
        "message": "Form created successfully",
        "form_id": form_id,
        "share_token": share_token,
        "share_url": f"{_get_base_url()}/form/{share_token}",
    }), 201


@forms_bp.route("", methods=["GET"])
@token_required
def list_forms(current_user_id):
    """List all forms owned by the current user, with response/view counts."""
    search = request.args.get("search", "").strip()

    query = """
        SELECT f.*,
            (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS response_count
        FROM forms f
        WHERE f.user_id = %s
    """
    params = [current_user_id]

    if search:
        query += " AND f.title LIKE %s"
        params.append(f"%{search}%")

    query += " ORDER BY f.created_at DESC"

    forms = execute_query(query, tuple(params), fetch_all=True)
    forms = [_serialize_form(f) for f in forms]

    return jsonify({"success": True, "forms": forms}), 200


@forms_bp.route("/<int:form_id>", methods=["GET"])
@token_required
def get_form(current_user_id, form_id):
    """Get a single form (owner-only) with its fields, for editing/viewing."""
    form = execute_query(
        "SELECT * FROM forms WHERE id = %s AND user_id = %s",
        (form_id, current_user_id),
        fetch_one=True,
    )
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404

    fields = execute_query(
        "SELECT * FROM form_fields WHERE form_id = %s ORDER BY field_order ASC",
        (form_id,),
        fetch_all=True,
    )
    fields = [_serialize_field(f) for f in fields]

    form = _serialize_form(form)
    form["fields"] = fields
    form["share_url"] = f"{_get_base_url()}/form/{form['share_token']}"

    return jsonify({"success": True, "form": form}), 200


@forms_bp.route("/<int:form_id>", methods=["PUT"])
@token_required
def update_form(current_user_id, form_id):
    """Update form title/description/settings and replace its fields."""
    existing = execute_query(
        "SELECT id FROM forms WHERE id = %s AND user_id = %s",
        (form_id, current_user_id),
        fetch_one=True,
    )
    if not existing:
        return jsonify({"success": False, "message": "Form not found"}), 404

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    fields = data.get("fields")
    theme_color = data.get("theme_color", "#6366f1")
    is_published = bool(data.get("is_published", True))
    accepts_responses = bool(data.get("accepts_responses", True))

    if not title:
        return jsonify({"success": False, "message": "Form title is required"}), 400

    if fields is not None:
        field_errors = validate_form_fields(fields)
        if field_errors:
            return jsonify({"success": False, "message": "; ".join(field_errors)}), 400

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE forms SET title = %s, description = %s, theme_color = %s,
               is_published = %s, accepts_responses = %s WHERE id = %s""",
            (title, description, theme_color, is_published, accepts_responses, form_id),
        )
        if fields is not None:
            _save_fields(cursor, form_id, fields)
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

    return jsonify({"success": True, "message": "Form updated successfully"}), 200


@forms_bp.route("/<int:form_id>", methods=["DELETE"])
@token_required
def delete_form(current_user_id, form_id):
    existing = execute_query(
        "SELECT id FROM forms WHERE id = %s AND user_id = %s",
        (form_id, current_user_id),
        fetch_one=True,
    )
    if not existing:
        return jsonify({"success": False, "message": "Form not found"}), 404

    execute_query("DELETE FROM forms WHERE id = %s", (form_id,), commit=True)
    return jsonify({"success": True, "message": "Form deleted successfully"}), 200


@forms_bp.route("/<int:form_id>/duplicate", methods=["POST"])
@token_required
def duplicate_form(current_user_id, form_id):
    """Create a copy of an existing form owned by the current user."""
    form = execute_query(
        "SELECT * FROM forms WHERE id = %s AND user_id = %s",
        (form_id, current_user_id),
        fetch_one=True,
    )
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404

    fields = execute_query(
        "SELECT * FROM form_fields WHERE form_id = %s ORDER BY field_order ASC",
        (form_id,),
        fetch_all=True,
    )

    new_share_token = generate_share_token()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO forms (user_id, title, description, share_token, theme_color, is_published)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (current_user_id, f"{form['title']} (Copy)", form["description"],
             new_share_token, form["theme_color"], False),
        )
        new_form_id = cursor.lastrowid
        for idx, field in enumerate(fields):
            cursor.execute(
                """INSERT INTO form_fields
                   (form_id, field_type, label, placeholder, is_required, field_order, options, validation)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (new_form_id, field["field_type"], field["label"], field["placeholder"],
                 field["is_required"], idx, field["options"], field["validation"]),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

    return jsonify({"success": True, "message": "Form duplicated", "form_id": new_form_id}), 201

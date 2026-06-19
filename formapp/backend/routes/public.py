"""
Public routes — no authentication required.
Used for the shareable form link: viewing a form and submitting a response.
"""
import json
from flask import Blueprint, request, jsonify
from db import execute_query, get_connection

public_bp = Blueprint("public", __name__, url_prefix="/api/public")


def _get_client_ip():
    if request.headers.get("X-Forwarded-For"):
        return request.headers.get("X-Forwarded-For").split(",")[0].strip()
    return request.remote_addr


@public_bp.route("/forms/<string:share_token>", methods=["GET"])
def get_public_form(share_token):
    """Fetch a form by its share token for public viewing/filling, and log a view."""
    form = execute_query(
        "SELECT * FROM forms WHERE share_token = %s",
        (share_token,),
        fetch_one=True,
    )
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404

    if not form["is_published"]:
        return jsonify({"success": False, "message": "This form is not currently available"}), 403

    fields = execute_query(
        "SELECT id, field_type, label, placeholder, is_required, field_order, options "
        "FROM form_fields WHERE form_id = %s ORDER BY field_order ASC",
        (form["id"],),
        fetch_all=True,
    )
    for f in fields:
        if isinstance(f.get("options"), str):
            try:
                f["options"] = json.loads(f["options"]) if f["options"] else []
            except (json.JSONDecodeError, TypeError):
                f["options"] = []
        f["is_required"] = bool(f["is_required"])

    # Log the view for analytics and bump the counter
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO form_views (form_id, visitor_ip) VALUES (%s, %s)",
            (form["id"], _get_client_ip()),
        )
        cursor.execute(
            "UPDATE forms SET view_count = view_count + 1 WHERE id = %s",
            (form["id"],),
        )
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

    return jsonify({
        "success": True,
        "form": {
            "id": form["id"],
            "title": form["title"],
            "description": form["description"],
            "theme_color": form["theme_color"],
            "accepts_responses": bool(form["accepts_responses"]),
            "fields": fields,
        },
    }), 200


@public_bp.route("/forms/<string:share_token>/submit", methods=["POST"])
def submit_response(share_token):
    """Accept a response submission for a published form."""
    form = execute_query(
        "SELECT id, is_published, accepts_responses FROM forms WHERE share_token = %s",
        (share_token,),
        fetch_one=True,
    )
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404
    if not form["is_published"] or not form["accepts_responses"]:
        return jsonify({"success": False, "message": "This form is not currently accepting responses"}), 403

    data = request.get_json(silent=True) or {}
    answers = data.get("answers", {})  # { field_id: value }

    if not answers:
        return jsonify({"success": False, "message": "No answers were submitted"}), 400

    # Validate required fields are present
    fields = execute_query(
        "SELECT id, label, is_required FROM form_fields WHERE form_id = %s",
        (form["id"],),
        fetch_all=True,
    )
    missing = []
    for field in fields:
        if field["is_required"]:
            val = answers.get(str(field["id"]))
            if val is None or (isinstance(val, str) and not val.strip()) or (isinstance(val, list) and not val):
                missing.append(field["label"])

    if missing:
        return jsonify({
            "success": False,
            "message": f"Please fill in required fields: {', '.join(missing)}",
        }), 400

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO responses (form_id, respondent_ip) VALUES (%s, %s)",
            (form["id"], _get_client_ip()),
        )
        response_id = cursor.lastrowid

        for field_id_str, value in answers.items():
            try:
                field_id = int(field_id_str)
            except (ValueError, TypeError):
                continue

            if isinstance(value, list):
                value = ", ".join(str(v) for v in value)
            else:
                value = str(value) if value is not None else ""

            cursor.execute(
                "INSERT INTO response_answers (response_id, field_id, answer_value) VALUES (%s, %s, %s)",
                (response_id, field_id, value),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()

    return jsonify({"success": True, "message": "Thank you! Your response has been submitted."}), 201

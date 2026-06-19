"""
Response management routes: dashboard listing (search/filter/pagination),
single response detail, deletion, and CSV/Excel export.
"""
import io
import csv
import json
from flask import Blueprint, request, jsonify, send_file
from db import execute_query
from utils.auth import token_required

responses_bp = Blueprint("responses", __name__, url_prefix="/api/forms")


def _check_form_ownership(form_id, user_id):
    return execute_query(
        "SELECT id, title FROM forms WHERE id = %s AND user_id = %s",
        (form_id, user_id),
        fetch_one=True,
    )


def _get_fields(form_id):
    return execute_query(
        "SELECT id, label, field_type, field_order FROM form_fields WHERE form_id = %s ORDER BY field_order ASC",
        (form_id,),
        fetch_all=True,
    )


def _get_responses_with_answers(form_id, search=None):
    """Fetch all responses for a form, each with its answers keyed by field_id."""
    responses = execute_query(
        "SELECT id, submitted_at, respondent_ip FROM responses WHERE form_id = %s ORDER BY submitted_at DESC",
        (form_id,),
        fetch_all=True,
    )
    if not responses:
        return []

    response_ids = [r["id"] for r in responses]
    placeholders = ",".join(["%s"] * len(response_ids))
    answers = execute_query(
        f"SELECT response_id, field_id, answer_value FROM response_answers WHERE response_id IN ({placeholders})",
        tuple(response_ids),
        fetch_all=True,
    )

    answers_by_response = {}
    for a in answers:
        answers_by_response.setdefault(a["response_id"], {})[a["field_id"]] = a["answer_value"]

    results = []
    for r in responses:
        r["submitted_at"] = r["submitted_at"].isoformat() if r["submitted_at"] else None
        r["answers"] = answers_by_response.get(r["id"], {})
        results.append(r)

    if search:
        search_lower = search.lower()
        filtered = []
        for r in results:
            if any(search_lower in str(v).lower() for v in r["answers"].values()):
                filtered.append(r)
        results = filtered

    return results


@responses_bp.route("/<int:form_id>/responses", methods=["GET"])
@token_required
def list_responses(current_user_id, form_id):
    """List responses for a form with optional search and date filter."""
    form = _check_form_ownership(form_id, current_user_id)
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404

    search = request.args.get("search", "").strip()
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()

    fields = _get_fields(form_id)
    responses = _get_responses_with_answers(form_id, search=search if search else None)

    if date_from:
        responses = [r for r in responses if r["submitted_at"] and r["submitted_at"] >= date_from]
    if date_to:
        responses = [r for r in responses if r["submitted_at"] and r["submitted_at"] <= date_to + "T23:59:59"]

    return jsonify({
        "success": True,
        "fields": fields,
        "responses": responses,
        "total": len(responses),
    }), 200


@responses_bp.route("/<int:form_id>/responses/<int:response_id>", methods=["DELETE"])
@token_required
def delete_response(current_user_id, form_id, response_id):
    form = _check_form_ownership(form_id, current_user_id)
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404

    execute_query(
        "DELETE FROM responses WHERE id = %s AND form_id = %s",
        (response_id, form_id),
        commit=True,
    )
    return jsonify({"success": True, "message": "Response deleted"}), 200


@responses_bp.route("/<int:form_id>/analytics", methods=["GET"])
@token_required
def get_analytics(current_user_id, form_id):
    """Return total submissions, total views, and submission counts over time."""
    form = execute_query(
        "SELECT id, title, view_count, created_at FROM forms WHERE id = %s AND user_id = %s",
        (form_id, current_user_id),
        fetch_one=True,
    )
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404

    total_responses = execute_query(
        "SELECT COUNT(*) AS count FROM responses WHERE form_id = %s",
        (form_id,),
        fetch_one=True,
    )["count"]

    daily = execute_query(
        """SELECT DATE(submitted_at) AS day, COUNT(*) AS count
           FROM responses WHERE form_id = %s
           GROUP BY DATE(submitted_at) ORDER BY day ASC LIMIT 30""",
        (form_id,),
        fetch_all=True,
    )
    for d in daily:
        d["day"] = d["day"].isoformat() if d["day"] else None

    completion_rate = 0
    if form["view_count"] and form["view_count"] > 0:
        completion_rate = round((total_responses / form["view_count"]) * 100, 1)

    return jsonify({
        "success": True,
        "analytics": {
            "form_title": form["title"],
            "total_views": form["view_count"],
            "total_responses": total_responses,
            "completion_rate": completion_rate,
            "responses_over_time": daily,
        },
    }), 200


@responses_bp.route("/<int:form_id>/export", methods=["GET"])
@token_required
def export_responses(current_user_id, form_id):
    """Export all responses as CSV or Excel (?format=csv|xlsx)."""
    form = _check_form_ownership(form_id, current_user_id)
    if not form:
        return jsonify({"success": False, "message": "Form not found"}), 404

    export_format = request.args.get("format", "csv").lower()
    fields = _get_fields(form_id)
    responses = _get_responses_with_answers(form_id)

    headers = ["Response ID", "Submitted At"] + [f["label"] for f in fields]
    rows = []
    for r in responses:
        row = [r["id"], r["submitted_at"]]
        for f in fields:
            row.append(r["answers"].get(f["id"], ""))
        rows.append(row)

    safe_title = "".join(c if c.isalnum() or c in (" ", "_", "-") else "_" for c in form["title"])

    if export_format == "xlsx":
        try:
            from openpyxl import Workbook
        except ImportError:
            return jsonify({"success": False, "message": "Excel export is unavailable on the server"}), 500

        wb = Workbook()
        ws = wb.active
        ws.title = "Responses"
        ws.append(headers)
        for row in rows:
            ws.append(row)

        # auto-width columns roughly
        for i, header in enumerate(headers, start=1):
            col_letter = ws.cell(row=1, column=i).column_letter
            max_len = max([len(str(header))] + [len(str(r[i - 1])) for r in rows]) if rows else len(str(header))
            ws.column_dimensions[col_letter].width = min(max_len + 4, 50)

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=f"{safe_title}_responses.xlsx",
        )
    else:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(headers)
        writer.writerows(rows)

        byte_buffer = io.BytesIO(buffer.getvalue().encode("utf-8-sig"))
        return send_file(
            byte_buffer,
            mimetype="text/csv",
            as_attachment=True,
            download_name=f"{safe_title}_responses.csv",
        )

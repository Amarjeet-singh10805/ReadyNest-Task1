"""
Input validation helpers for request payloads.
"""
import re

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

VALID_FIELD_TYPES = {
    "text", "email", "number", "textarea", "checkbox",
    "radio", "dropdown", "date", "phone", "url"
}


def is_valid_email(email):
    return bool(email) and bool(EMAIL_REGEX.match(email))


def is_valid_password(password):
    """Require at least 6 characters."""
    return bool(password) and len(password) >= 6


def validate_registration(data):
    errors = []
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name:
        errors.append("Name is required")
    if not is_valid_email(email):
        errors.append("A valid email is required")
    if not is_valid_password(password):
        errors.append("Password must be at least 6 characters long")

    return errors


def validate_login(data):
    errors = []
    if not (data.get("email") or "").strip():
        errors.append("Email is required")
    if not data.get("password"):
        errors.append("Password is required")
    return errors


def validate_form_fields(fields):
    """Validate a list of field definitions submitted by the form builder."""
    errors = []
    if not isinstance(fields, list) or len(fields) == 0:
        errors.append("A form must have at least one field")
        return errors

    for idx, field in enumerate(fields):
        field_type = field.get("field_type")
        label = (field.get("label") or "").strip()

        if field_type not in VALID_FIELD_TYPES:
            errors.append(f"Field #{idx + 1}: invalid field type '{field_type}'")
        if not label:
            errors.append(f"Field #{idx + 1}: label is required")
        if field_type in ("checkbox", "radio", "dropdown"):
            options = field.get("options")
            if not options or not isinstance(options, list) or len(options) < 1:
                errors.append(f"Field #{idx + 1}: at least one option is required for {field_type}")

    return errors

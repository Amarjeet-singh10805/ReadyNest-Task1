
import os
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS

from config import Config
from db import init_pool
from routes.auth import auth_bp
from routes.forms import forms_bp
from routes.public import public_bp
from routes.responses import responses_bp

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")


def _check_production_secrets():
 
    if Config.DEBUG:
        return  # local dev — defaults are expected and fine
    insecure_defaults = {
        "SECRET_KEY": "ag123fklmno564df",
        "JWT_SECRET_KEY": "mga12ytgf234g",
    }
    for key, default_value in insecure_defaults.items():
        if getattr(Config, key) == default_value:
            print(
                f"[SECURITY WARNING] {key} is still set to its insecure default value. "
                f"Set a unique random {key} environment variable before exposing this "
                f"app publicly — e.g. run: python3 -c \"import secrets; print(secrets.token_hex(32))\""
            )


def create_app():
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
    app.config.from_object(Config)

    _check_production_secrets()

    # flask-cors expects "*" as a bare string for wildcard, not a
    # single-item list containing "*" — handle both configured forms.
    cors_origins = "*" if Config.CORS_ORIGINS == ["*"] else Config.CORS_ORIGINS
    CORS(app, resources={r"/api/*": {"origins": cors_origins}}, supports_credentials=True)

    # Initialize MySQL connection pool
    init_pool()

    # Register API blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(forms_bp)
    app.register_blueprint(public_bp)
    app.register_blueprint(responses_bp)

    # ---------------- Error handlers ----------------
    @app.errorhandler(404)
    def not_found(e):
        if "/api/" in str(e):
            return jsonify({"success": False, "message": "Endpoint not found"}), 404
        # Fallback to index.html for frontend client-side routing
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"success": False, "message": "An internal server error occurred"}), 500

    # ---------------- Frontend routes ----------------
    @app.route("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.route("/<path:path>")
    def static_proxy(path):
        full_path = os.path.join(FRONTEND_DIR, path)
        if os.path.isfile(full_path):
            return send_from_directory(FRONTEND_DIR, path)
        # SPA-style routes like /form/<token>, /dashboard, /builder etc.
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.route("/api/health")
    def health():
        """
        Health check endpoint for platform monitoring (Render, Railway, k8s,
        load balancers, etc). Verifies the database is actually reachable,
        not just that the Flask process is up — a deploy can boot fine and
        still be unable to serve real requests if the DB connection is bad.
        """
        from db import get_connection
        try:
            conn = get_connection()
            conn.close()
            db_status = "connected"
        except Exception as e:
            return jsonify({
                "success": False,
                "message": "Server is running but database is unreachable",
                "database": "unreachable",
                "error": str(e),
            }), 503

        return jsonify({"success": True, "message": "Server is running", "database": db_status}), 200

    @app.route("/form/<string:share_token>")
    def public_form_redirect(share_token):
        """Pretty share URL: /form/<token> -> form.html?token=<token>"""
        from flask import redirect
        return redirect(f"/form.html?token={share_token}")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)

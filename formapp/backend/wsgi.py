"""
WSGI entry point for production servers (gunicorn, uWSGI, etc).

Run with:
    gunicorn -w 4 -b 0.0.0.0:5000 wsgi:application
"""
from app import app as application

if __name__ == "__main__":
    application.run()

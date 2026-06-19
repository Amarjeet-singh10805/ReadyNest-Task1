"""
MySQL connection pool and helper functions.
Uses mysql-connector-python with a pooled connection for efficiency.
"""
import os
import time
import mysql.connector
from mysql.connector import pooling, Error
from config import Config

_pool = None

SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "database", "schema.sql"
)


def _connect_with_retry(max_attempts=10, delay_seconds=3, **kwargs):
    """
    Try to open a raw MySQL connection, retrying with a delay.
    Many hosting platforms start the web process before the database is
    fully reachable (or before DNS/networking settles), so this avoids
    crash-looping the app on first boot.
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return mysql.connector.connect(**kwargs)
        except Error as e:
            last_error = e
            print(f"[db] Connection attempt {attempt}/{max_attempts} failed: {e}")
            if attempt < max_attempts:
                time.sleep(delay_seconds)
    raise last_error


def _split_sql_statements(sql_text):
    """
    Split a .sql file's contents into individual executable statements.

    Strips full-line '--' comments first (line by line), then splits the
    remaining text on ';'. Splitting on ';' before removing comments is a
    bug: every statement in this schema is preceded by a comment block, so
    naively checking "does this chunk start with '--'" silently discards
    real CREATE TABLE statements along with their leading comments.
    """
    lines = []
    for line in sql_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        lines.append(line)
    cleaned = "\n".join(lines)
    return [s.strip() for s in cleaned.split(";") if s.strip()]


def ensure_database_and_schema():
    """
    Idempotently create the target database (if missing) and apply schema.sql
    against it. Safe to run on every startup — all DDL in schema.sql uses
    CREATE TABLE IF NOT EXISTS. This removes the manual "create DB / run
    schema.sql by hand" step for deploys.

    The database name itself comes from Config.DB_NAME (not hardcoded in
    the .sql file), so this works whether you're using a fresh local MySQL
    install or a managed provider that pre-assigns its own database name.
    """
    if not os.path.exists(SCHEMA_PATH):
        print(f"[db] No schema.sql found at {SCHEMA_PATH}, skipping auto-init.")
        return

    # Step 1: connect without selecting a database (it may not exist yet),
    # and create it if needed. Some managed providers disallow CREATE
    # DATABASE for the app's user — that's fine, we just log and move on,
    # since the DB likely already exists and was pre-provisioned for us.
    conn = _connect_with_retry(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
    )
    try:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{Config.DB_NAME}` "
                f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            conn.commit()
        except Error as e:
            print(f"[db] Could not create database '{Config.DB_NAME}' "
                  f"(it likely already exists, or the user lacks CREATE privileges): {e}")
        cursor.close()
    finally:
        conn.close()

    # Step 2: connect to the actual target database and apply the schema.
    conn = _connect_with_retry(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        database=Config.DB_NAME,
    )
    try:
        with open(SCHEMA_PATH, "r") as f:
            schema_sql = f.read()

        cursor = conn.cursor()
        statements = _split_sql_statements(schema_sql)
        for statement in statements:
            cursor.execute(statement)
        conn.commit()
        cursor.close()
        print(f"[db] Schema verified/applied successfully against '{Config.DB_NAME}'.")
    except Error as e:
        print(f"[db] Warning: schema initialization failed: {e}")
    finally:
        conn.close()


def init_pool():
    """Initialize the MySQL connection pool. Call once at app startup."""
    global _pool
    if _pool is None:
        # Make sure the database + tables exist before the pool tries to
        # connect to a specific database that might not exist yet.
        ensure_database_and_schema()

        _pool = pooling.MySQLConnectionPool(
            pool_name="form_builder_pool",
            pool_size=10,
            pool_reset_session=True,
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            database=Config.DB_NAME,
            autocommit=False,
        )
    return _pool


def get_connection():
    """Get a connection from the pool. Caller must close() it (returns to pool)."""
    global _pool
    if _pool is None:
        init_pool()
    return _pool.get_connection()


def execute_query(query, params=None, fetch_one=False, fetch_all=False, commit=False):
    """
    Generic helper to execute a query safely with automatic connection handling.
    Returns: lastrowid on insert/commit, list/dict on fetch, or None.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())

        result = None
        if fetch_one:
            result = cursor.fetchone()
        elif fetch_all:
            result = cursor.fetchall()

        if commit:
            conn.commit()
            result = cursor.lastrowid

        return result
    except Error as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

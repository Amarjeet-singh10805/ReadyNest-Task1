-- ============================================================
-- Dynamic Form Builder - MySQL Schema
-- ============================================================
-- This file defines tables only and intentionally does NOT hardcode
-- a database name with CREATE DATABASE / USE statements, since most
-- managed MySQL providers (Railway, PlanetScale, AWS RDS, etc.) give
-- you a pre-provisioned database with its own name.
--
-- The app applies this automatically on startup against whichever
-- database DB_NAME points to (see backend/db.py).
--
-- To run manually instead:
--   mysql -u <user> -p <your_db_name> < schema.sql

-- ------------------------------------------------------------
-- Users table - handles authentication
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Forms table - stores form metadata
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    share_token VARCHAR(64) NOT NULL UNIQUE,
    is_published BOOLEAN DEFAULT FALSE,
    accepts_responses BOOLEAN DEFAULT TRUE,
    view_count INT DEFAULT 0,
    theme_color VARCHAR(20) DEFAULT '#6366f1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_share_token (share_token),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Form fields table - stores each field/question in a form
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT NOT NULL,
    field_type VARCHAR(30) NOT NULL,   -- text, email, number, textarea, checkbox, radio, dropdown, date, phone
    label VARCHAR(255) NOT NULL,
    placeholder VARCHAR(255),
    is_required BOOLEAN DEFAULT FALSE,
    field_order INT NOT NULL DEFAULT 0,
    options JSON,                       -- for checkbox/radio/dropdown choices
    validation JSON,                    -- min/max length, regex, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    INDEX idx_form_id (form_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Responses table - one row per form submission
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    respondent_ip VARCHAR(45),
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    INDEX idx_form_id (form_id),
    INDEX idx_submitted_at (submitted_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Response answers table - one row per field answer
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS response_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT NOT NULL,
    field_id INT NOT NULL,
    answer_value TEXT,
    FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES form_fields(id) ON DELETE CASCADE,
    INDEX idx_response_id (response_id),
    INDEX idx_field_id (field_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Form views table - tracks analytics for view counts over time
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    visitor_ip VARCHAR(45),
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    INDEX idx_form_id (form_id)
) ENGINE=InnoDB;

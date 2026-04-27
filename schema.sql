-- ─────────────────────────────────────────────────────────────────────────────
-- GlowAI — Skin & Hair Care AI Consultation Platform
-- MySQL Schema
-- Run: mysql -u root -p < schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS skin_hair_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE skin_hair_ai;

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  name            VARCHAR(100)            DEFAULT NULL,
  gender          VARCHAR(20)             DEFAULT NULL,
  problem_type    VARCHAR(50)             DEFAULT NULL   COMMENT 'Skin | Hair',
  problem_details TEXT                    DEFAULT NULL,
  country         VARCHAR(100)            DEFAULT NULL,
  state           VARCHAR(100)            DEFAULT NULL,
  city            VARCHAR(100)            DEFAULT NULL,
  pincode         VARCHAR(20)             DEFAULT NULL,
  mobile          VARCHAR(15)    NOT NULL,
  session_id      VARCHAR(100)            DEFAULT NULL,
  created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_mobile     (mobile),
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── otp_logs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_logs (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  mobile     VARCHAR(15)    NOT NULL,
  otp        VARCHAR(6)     NOT NULL,
  verified   TINYINT(1)     NOT NULL DEFAULT 0,
  created_at TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_mobile     (mobile),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 0002_auth: users and login sessions (Phase 5).
--
-- Mirrors packages/shared/src/auth.ts. Only creates new objects; existing
-- tables and data are untouched. Applied by scripts/db.sh in one transaction.
-- Migrations are append-only: never edit this file once applied — add 0003_*.sql.

-- ---------------------------------------------------------------------------
-- users: never deleted — deactivate with is_active = false.
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lower-case; the API normalises before insert and lookup.
  username      text NOT NULL CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  display_name  text CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 100),
  -- Argon2id PHC string only; a plain-text password can never be stored here.
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  role          text NOT NULL CHECK (role IN ('admin', 'surveyor', 'viewer')),
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_username_key UNIQUE (username)
);

-- Supports the last-active-admin check.
CREATE INDEX users_active_admin_idx ON users (id) WHERE role = 'admin' AND is_active;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- user_sessions: one row per login. The id is the JWT `jti`; a token is only
-- accepted while its row is neither revoked nor expired.
-- ---------------------------------------------------------------------------

CREATE TABLE user_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT user_sessions_expiry_check CHECK (expires_at > created_at)
);

-- Revoke-all-sessions for a user (logout everywhere, password change).
CREATE INDEX user_sessions_user_active_idx ON user_sessions (user_id)
  WHERE revoked_at IS NULL;

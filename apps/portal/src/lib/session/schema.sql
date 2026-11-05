-- RedactPlus portal: server-side sessions and download history.
-- Owned by the portal. Holds no passwords, no licence records and nothing from the
-- Control Center database. Apply with: psql "$PORTAL_DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS portal_sessions (
  id_hash        char(64)    PRIMARY KEY,           -- SHA-256 of the cookie value
  subject        text        NOT NULL,              -- identity provider `sub`
  email          text,
  email_verified boolean     NOT NULL DEFAULT false,
  display_name   text,
  csrf_token     text        NOT NULL,
  sealed_tokens  text        NOT NULL,              -- AES-256-GCM, key derived from PORTAL_SESSION_SECRET
  created_at     timestamptz NOT NULL,
  last_seen_at   timestamptz NOT NULL,
  expires_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS portal_sessions_expires_at_idx ON portal_sessions (expires_at);
CREATE INDEX IF NOT EXISTS portal_sessions_last_seen_at_idx ON portal_sessions (last_seen_at);

CREATE TABLE IF NOT EXISTS portal_download_events (
  id            bigserial   PRIMARY KEY,
  subject       text        NOT NULL,
  version       text        NOT NULL,
  file_name     text        NOT NULL,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_download_events_subject_idx
  ON portal_download_events (subject, downloaded_at DESC);

-- Migration 001 — the social layer's whole schema (specs/002-m3-social-layer/data-model.md).
--
-- Things in here that are load-bearing and easy to "tidy" into a bug:
--
--  1. comments.offset_ms is NULLABLE and is in THIS migration. The timestamped comment is
--     the product (constitution, Technology Constraints); the moment is optional by the
--     2026-09-21 clarification. Do not add NOT NULL "for consistency".
--  2. reactions' primary key includes bucket, not offset_ms: two taps at 03:00 and 03:01 in
--     a 3-hour episode are the same segment and must count once (FR-018).
--  3. positions has NO foreign key to episodes: a position outlives the episode row, exactly
--     as on the phone (M1 FR-023).
--  4. episode_heat is DERIVED. It is rebuilt per episode inside the writing transaction
--     (research R4); nothing else writes it.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS listeners (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext      UNIQUE NOT NULL,
  password_hash   text        NOT NULL,
  display_name    text        NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  failed_attempts int         NOT NULL DEFAULT 0,
  locked_until    timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash      bytea       PRIMARY KEY,
  listener_id     uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  device_label    text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_by_listener ON sessions (listener_id);

-- Client-registered (research R6). id = fnv1a64(feed_url || U+0001 || guid), the phone's id.
CREATE TABLE IF NOT EXISTS episodes (
  id              text        PRIMARY KEY,
  feed_url        text        NOT NULL,
  guid            text        NOT NULL,
  title           text        NOT NULL,
  show_title      text        NULL,
  enclosure_url   text        NOT NULL,
  image_url       text        NULL,
  duration_ms     int         NULL CHECK (duration_ms > 0),
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_url, guid)
);

CREATE TABLE IF NOT EXISTS comments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id      text        NOT NULL REFERENCES episodes(id),
  author_id       uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  parent_id       uuid        NULL REFERENCES comments(id),
  body            text        NULL CHECK (body IS NULL OR length(body) BETWEEN 1 AND 2000),
  offset_ms       int         NULL CHECK (offset_ms >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL
);
CREATE INDEX IF NOT EXISTS comments_by_episode_newest ON comments (episode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_by_episode_moment ON comments (episode_id, offset_ms)
  WHERE offset_ms IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS comments_by_parent ON comments (parent_id);

-- FR-009: replies are one level deep. The app checks this too; the trigger is the backstop.
CREATE OR REPLACE FUNCTION comments_reply_depth() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM comments p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reply_depth' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comments_reply_depth ON comments;
CREATE TRIGGER comments_reply_depth BEFORE INSERT OR UPDATE OF parent_id ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_reply_depth();

CREATE TABLE IF NOT EXISTS reactions (
  listener_id     uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  episode_id      text        NOT NULL REFERENCES episodes(id),
  bucket          smallint    NOT NULL CHECK (bucket BETWEEN 0 AND 99),
  offset_ms       int         NOT NULL CHECK (offset_ms >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, episode_id, bucket)
);
CREATE INDEX IF NOT EXISTS reactions_by_episode ON reactions (episode_id);

CREATE TABLE IF NOT EXISTS episode_heat (
  episode_id         text     NOT NULL REFERENCES episodes(id),
  bucket             smallint NOT NULL CHECK (bucket BETWEEN 0 AND 99),
  distinct_listeners int      NOT NULL,
  PRIMARY KEY (episode_id, bucket)
);

CREATE TABLE IF NOT EXISTS positions (
  listener_id     uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  episode_id      text        NOT NULL,                       -- deliberately no FK (note 3)
  offset_ms       int         NOT NULL CHECK (offset_ms >= 0),
  finished        boolean     NOT NULL DEFAULT false,
  progress_seq    bigint      NOT NULL,
  explicit_seek   boolean     NOT NULL DEFAULT false,
  device_id       text        NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, episode_id)
);

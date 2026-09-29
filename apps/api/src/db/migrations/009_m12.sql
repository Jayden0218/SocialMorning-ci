-- M12 — the finish. specs/012-m12-the-finish/data-model.md
--
-- The users table is `listeners` (the data model says "accounts"; same thing).
-- Curated issues are NOT tables: they live in picks.json next to the picks (no editor UI in M12).

-- FR-023: one like per listener per comment. Liking your own comment is refused by the
-- route (guard G-C2), not here: the author can change (a deleted account nulls author_id).
CREATE TABLE comment_likes (
  comment_id  uuid        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, listener_id)
);
CREATE INDEX comment_likes_by_listener ON comment_likes (listener_id);

-- FR-042 (guard G-L1): "N listening now" counts installs, never accounts. There is NO
-- listener or account column here and there must never be one: the hash is
-- sha256(installId : daily salt), so it cannot be joined to anyone and changes every day.
CREATE TABLE live_listeners (
  episode_id    text        NOT NULL,
  listener_hash text        NOT NULL CHECK (length(listener_hash) = 64),
  seen_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (episode_id, listener_hash)
);
CREATE INDEX live_listeners_recent ON live_listeners (episode_id, seen_at DESC);

-- FR-093: per-show "new episode" notifications. No row = on.
CREATE TABLE notify_show_prefs (
  listener_id uuid    NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  feed_url    text    NOT NULL CHECK (length(feed_url) BETWEEN 1 AND 2048),
  enabled     boolean NOT NULL DEFAULT true,
  PRIMARY KEY (listener_id, feed_url)
);

-- FR-104 (constitution 2.2.0 exception, storage approved by name as the Vercel Blob store
-- `socialmorning-voice`): a voice status post, ≤ 60 s, gone at 48 h — the blob AND the row
-- (guard G-V1). Reads also never return an expired row, but that is not the deletion.
CREATE TABLE voice_posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  blob_url    text        NOT NULL,
  blob_path   text        NOT NULL,
  duration_ms int         NOT NULL CHECK (duration_ms BETWEEN 1 AND 60000),
  bytes       int         NOT NULL CHECK (bytes BETWEEN 1 AND 600000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '48 hours'
);
CREATE INDEX voice_posts_by_listener ON voice_posts (listener_id, created_at DESC);
CREATE INDEX voice_posts_expiry ON voice_posts (expires_at);

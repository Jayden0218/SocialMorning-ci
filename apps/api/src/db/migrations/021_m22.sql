-- M22 (spec 023): the 小宇宙 gaps, part 2. One migration for every server change in data-model.md.

-- US1/US6/US15: push switches per kind (all on by default).
ALTER TABLE push_prefs ADD COLUMN IF NOT EXISTS replies   boolean NOT NULL DEFAULT true;
ALTER TABLE push_prefs ADD COLUMN IF NOT EXISTS likes     boolean NOT NULL DEFAULT true;
ALTER TABLE push_prefs ADD COLUMN IF NOT EXISTS follows   boolean NOT NULL DEFAULT true;
ALTER TABLE push_prefs ADD COLUMN IF NOT EXISTS mentions  boolean NOT NULL DEFAULT true;
ALTER TABLE push_prefs ADD COLUMN IF NOT EXISTS statuses  boolean NOT NULL DEFAULT true;
ALTER TABLE push_prefs ADD COLUMN IF NOT EXISTS digest    boolean NOT NULL DEFAULT true;

-- US1: likes on one target within 10 minutes become one push (G-M22-4).
CREATE TABLE IF NOT EXISTS push_like_windows (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  target_key  text        NOT NULL,
  first_at    timestamptz NOT NULL DEFAULT now(),
  count       int         NOT NULL DEFAULT 1,
  PRIMARY KEY (listener_id, target_key)
);

-- US1–US3: new notice kinds.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'reply','like','mention','follow',
  'like_post_comment','like_post_like','status_reply','status_reaction','status_milestone'));

-- US3: mute one notice thread; stop like notices on one comment.
CREATE TABLE IF NOT EXISTS muted_threads (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  thread_kind text        NOT NULL CHECK (thread_kind IN ('comment','like_post')),
  thread_key  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, thread_kind, thread_key)
);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS like_notices_off boolean NOT NULL DEFAULT false;

-- US2: replies and reactions on a status; deleted with it (constitution 3.3.0, G-M22-2).
CREATE TABLE IF NOT EXISTS status_replies (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES voice_posts(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  body       text        NULL CHECK (char_length(body) BETWEEN 1 AND 140),
  audio_key  text        NULL,
  audio_url  text        NULL,
  audio_ms   int         NULL CHECK (audio_ms BETWEEN 1 AND 60000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((body IS NULL) <> (audio_key IS NULL))
);
CREATE INDEX IF NOT EXISTS status_replies_by_post ON status_replies (post_id, created_at);

CREATE TABLE IF NOT EXISTS status_reactions (
  post_id     uuid        NOT NULL REFERENCES voice_posts(id) ON DELETE CASCADE,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  kind        smallint    NOT NULL CHECK (kind BETWEEN 1 AND 6),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, listener_id)
);
ALTER TABLE voice_posts ADD COLUMN IF NOT EXISTS milestone_sent_at timestamptz NULL;

-- US6: up to 10 items on a status — episode cards and photos.
CREATE TABLE IF NOT EXISTS status_items (
  post_id    uuid     NOT NULL REFERENCES voice_posts(id) ON DELETE CASCADE,
  pos        smallint NOT NULL CHECK (pos BETWEEN 1 AND 10),
  kind       text     NOT NULL CHECK (kind IN ('episode','photo')),
  episode_id text     NULL,
  image_key  text     NULL,
  image_url  text     NULL,
  PRIMARY KEY (post_id, pos),
  CHECK ((kind = 'episode' AND episode_id IS NOT NULL) OR (kind = 'photo' AND image_key IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS status_push_log (
  author_id uuid NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  day       date NOT NULL,
  count     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (author_id, day)
);

-- US4: one queue per listener, versioned; a stale write gets 409 (G-M22-3).
CREATE TABLE IF NOT EXISTS queues (
  listener_id uuid        PRIMARY KEY REFERENCES listeners(id) ON DELETE CASCADE,
  items       jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_array_length(items) <= 300),
  version     int         NOT NULL DEFAULT 0,
  device_id   text        NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- US5: interests and "not liking these?" answers.
CREATE TABLE IF NOT EXISTS listener_interests (
  listener_id uuid        PRIMARY KEY REFERENCES listeners(id) ON DELETE CASCADE,
  genre_ids   int[]       NOT NULL DEFAULT '{}',
  skipped_at  timestamptz NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rec_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (reason IN ('familiar','topics','long','other')),
  note        text        NULL CHECK (char_length(note) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- US10: one bottom pin per episode; the existing show_mutes is the host ban.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS pinned_bottom_at timestamptz NULL;
CREATE UNIQUE INDEX IF NOT EXISTS comments_one_pinned_bottom ON comments (episode_id) WHERE pinned_bottom_at IS NOT NULL;
ALTER TABLE show_mutes ADD COLUMN IF NOT EXISTS reason text NULL CHECK (char_length(reason) <= 200);

-- US11: deletion waits 15 days; the account is hidden meanwhile (G-M22-8).
CREATE TABLE IF NOT EXISTS account_deletions (
  listener_id  uuid        PRIMARY KEY REFERENCES listeners(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at       timestamptz NOT NULL,
  cancelled_at timestamptz NULL
);
ALTER TABLE listeners ADD COLUMN IF NOT EXISTS hidden_at timestamptz NULL;
ALTER TABLE listeners ADD COLUMN IF NOT EXISTS tz text NULL;
ALTER TABLE listeners ADD COLUMN IF NOT EXISTS hide_often_listened boolean NOT NULL DEFAULT false;

-- US13: translated transcripts on Groq's free tier (constitution 3.3.0, G-M22-6/7).
CREATE TABLE IF NOT EXISTS translation_shows (
  feed_url   text        PRIMARY KEY,
  added_by   uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS translation_jobs (
  episode_id   text        NOT NULL,
  target_lang  text        NOT NULL CHECK (target_lang IN ('en','zh-Hans')),
  state        text        NOT NULL DEFAULT 'queued'
               CHECK (state IN ('queued','transcribing','translating','done','failed')),
  source_lang  text        NULL,
  segments     jsonb       NULL,
  next_chunk   int         NOT NULL DEFAULT 0,
  audio_s      int         NOT NULL DEFAULT 0,
  tokens       int         NOT NULL DEFAULT 0,
  errors       int         NOT NULL DEFAULT 0,
  error        text        NULL,
  not_before   timestamptz NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (episode_id, target_lang)
);
CREATE TABLE IF NOT EXISTS transcripts_translated (
  episode_id  text        NOT NULL,
  target_lang text        NOT NULL,
  lines       jsonb       NOT NULL,
  made_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (episode_id, target_lang)
);
CREATE TABLE IF NOT EXISTS groq_usage (
  day      date NOT NULL,
  model    text NOT NULL,
  requests int  NOT NULL DEFAULT 0,
  audio_s  int  NOT NULL DEFAULT 0,
  tokens   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model)
);

-- US14: a gift of a paid series, claimable once (G-M22-9).
CREATE TABLE IF NOT EXISTS gifts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         char(16)    NOT NULL UNIQUE,
  buyer_id     uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  feed_url     text        NOT NULL,
  purchase_id  uuid        NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  claimed_by   uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  claimed_at   timestamptz NULL,
  cancelled_at timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- US15: one digest per PLUS member per ISO week (G-M22-13).
CREATE TABLE IF NOT EXISTS weekly_digests (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  iso_week    text        NOT NULL,
  episode_ids text[]      NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, iso_week)
);

-- US17: "tell the editors" and shared show lists.
CREATE TABLE IF NOT EXISTS search_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  q           text        NOT NULL CHECK (char_length(q) BETWEEN 1 AND 200),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shared_lists (
  id         char(10)    PRIMARY KEY,
  owner_id   uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  title      text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  feed_urls  text[]      NOT NULL CHECK (cardinality(feed_urls) BETWEEN 2 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

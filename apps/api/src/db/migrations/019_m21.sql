-- M21 (specs/022-m21-the-xiaoyuzhou-gaps, data-model.md): the 小宇宙 gaps.

-- US6: total listening for the comment badge (100 h / 500 h / 1000 h). Kept by replaceRanges()
-- as after − before inside its transaction (G-M21-12); filled once by scripts/backfill-listened-ms.ts.
ALTER TABLE listeners ADD COLUMN listened_ms bigint NOT NULL DEFAULT 0 CHECK (listened_ms >= 0);

-- US6: the community rules, accepted once before a first comment (G-M21-7).
ALTER TABLE listeners ADD COLUMN rules_accepted_at timestamptz NULL;

-- US8 / US10: privacy switches. Read paths honour each; birthday and industry are never
-- returned to anyone but the owner (G-M21-10).
ALTER TABLE listeners ADD COLUMN hide_badge            boolean NOT NULL DEFAULT false;
ALTER TABLE listeners ADD COLUMN hide_stickers         boolean NOT NULL DEFAULT false;
ALTER TABLE listeners ADD COLUMN hide_decorations      boolean NOT NULL DEFAULT false;
ALTER TABLE listeners ADD COLUMN private_subscriptions boolean NOT NULL DEFAULT false;
ALTER TABLE listeners ADD COLUMN birthday              date    NULL;
ALTER TABLE listeners ADD COLUMN industry              text    NULL CHECK (industry IS NULL OR char_length(industry) BETWEEN 1 AND 40);

-- US10: unread = notifications newer than this.
ALTER TABLE listeners ADD COLUMN notifications_seen_at timestamptz NULL;

-- US6: the region the server saw when the comment was posted. Two letters, never a city (G-I1).
ALTER TABLE comments ADD COLUMN country char(2) NULL CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- US6: a listener mutes another for themselves only; the muted listener is never told (G-M21-6).
CREATE TABLE listener_mutes (
  muter_id   uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  muted_id   uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);

-- US2 / US4: report an episode, or a wrong transcript line ({offsetMs, original, suggested} in detail).
ALTER TABLE reports DROP CONSTRAINT reports_target_kind_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_kind_check
  CHECK (target_kind IN ('comment','clip','profile','show','episode','transcript'));
ALTER TABLE reports ADD COLUMN detail jsonb NULL;
-- A transcript report's target_id is '<episodeId>#<offsetMs>' (one line), so the existing
-- one-report-per-reporter key still holds per line; detail.episodeId finds them per episode.
CREATE INDEX reports_transcript_by_episode ON reports ((detail->>'episodeId'), created_at DESC)
  WHERE target_kind = 'transcript';

-- US5: episodes a verified host marks on the show page.
CREATE TABLE host_picks (
  feed_url   text        NOT NULL,
  episode_id text        NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position   smallint    NOT NULL CHECK (position BETWEEN 1 AND 20),
  picked_by  uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_url, episode_id)
);

-- US8: a text status (≤ 140 characters) lives in voice_posts with no audio, under the same
-- 24 h expiry and the same sweep (G-M21-8). Exactly one of audio or body.
ALTER TABLE voice_posts ALTER COLUMN blob_url    DROP NOT NULL;
ALTER TABLE voice_posts ALTER COLUMN blob_path   DROP NOT NULL;
ALTER TABLE voice_posts ALTER COLUMN duration_ms DROP NOT NULL;
ALTER TABLE voice_posts ALTER COLUMN bytes       DROP NOT NULL;
ALTER TABLE voice_posts ADD COLUMN body text NULL CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 140);
ALTER TABLE voice_posts ADD CONSTRAINT voice_posts_audio_or_body CHECK (
  (body IS NULL AND blob_url IS NOT NULL AND blob_path IS NOT NULL AND duration_ms IS NOT NULL AND bytes IS NOT NULL)
  OR (body IS NOT NULL AND blob_url IS NULL AND blob_path IS NULL AND duration_ms IS NULL AND bytes IS NULL)
);

-- US9: stickers placed on the profile header. Positions are fractions of the canvas width.
CREATE TABLE sticker_placements (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  sticker_id  text        NOT NULL CHECK (char_length(sticker_id) BETWEEN 1 AND 64),
  x           real        NOT NULL CHECK (x BETWEEN 0 AND 1),
  y           real        NOT NULL CHECK (y BETWEEN 0 AND 1),
  scale       real        NOT NULL CHECK (scale BETWEEN 0.5 AND 2.5),
  rot         real        NOT NULL CHECK (rot BETWEEN -6.2832 AND 6.2832),
  z           smallint    NOT NULL CHECK (z BETWEEN 0 AND 9),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, sticker_id)
);

-- US8: my own order of subscriptions ("Default" sort). NULL sorts last.
ALTER TABLE subscriptions ADD COLUMN sort_pos int NULL;

-- US10: interactions aimed at a listener. Written in the same transaction as the act; never to
-- self, never to someone who blocked or muted the actor (G-M21-9).
CREATE TABLE notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  kind         text        NOT NULL CHECK (kind IN ('reply','like','mention','follow')),
  actor_id     uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  ref          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_id <> actor_id)
);
CREATE INDEX notifications_inbox ON notifications (recipient_id, created_at DESC);

-- US7: comments and reactions on a like post. A like is keyed (owner, episode).
CREATE TABLE like_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid        NOT NULL,
  episode_id text        NOT NULL,
  author_id  uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  FOREIGN KEY (owner_id, episode_id) REFERENCES episode_likes(listener_id, episode_id) ON DELETE CASCADE
);
CREATE INDEX like_comments_by_like ON like_comments (owner_id, episode_id, created_at);

CREATE TABLE like_reactions (
  owner_id    uuid        NOT NULL,
  episode_id  text        NOT NULL,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  emoji       text        NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, episode_id, listener_id),
  FOREIGN KEY (owner_id, episode_id) REFERENCES episode_likes(listener_id, episode_id) ON DELETE CASCADE
);

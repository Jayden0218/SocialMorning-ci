-- 002_graph — M4 the graph (specs/004-m4-the-graph/data-model.md).
-- Clips are RANGES on an episode: no media, ever (constitution V).

ALTER TABLE listeners ADD COLUMN private_listening boolean NOT NULL DEFAULT false;

CREATE TABLE clips (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  client_id   text        NOT NULL,                        -- phone-generated; a retry makes one clip (R8, G8)
  episode_id  text        NOT NULL REFERENCES episodes(id),
  start_ms    int         NOT NULL CHECK (start_ms >= 0),
  end_ms      int         NOT NULL CHECK (end_ms > start_ms AND end_ms - start_ms BETWEEN 1000 AND 600000),
  caption     text        NOT NULL DEFAULT '' CHECK (length(caption) <= 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL,
  UNIQUE (author_id, client_id)
);
CREATE INDEX clips_episode ON clips (episode_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX clips_author  ON clips (author_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE follows (
  follower_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  followed_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id)
);
CREATE INDEX follows_followed ON follows (followed_id);

CREATE TABLE listened_ranges (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  episode_id  text        NOT NULL,                        -- no FK, like positions: an episode may be unregistered
  day         date        NOT NULL,                        -- the phone's local day
  device_id   text        NOT NULL,
  ranges      jsonb       NOT NULL,                        -- [[fromMs,toMs], …] merged, sorted, non-overlapping
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, episode_id, day, device_id)
);

CREATE TABLE activity (
  id          bigserial   PRIMARY KEY,
  actor_id    uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('listened','clipped','commented')),
  episode_id  text        NOT NULL REFERENCES episodes(id),
  moment_ms   int         NULL,                            -- clip start / comment offset / NULL for listened
  ref_id      uuid        NULL,                            -- clip id or comment id
  day         date        NULL,                            -- listened only: once per (actor, episode, day) (G6)
  hidden      boolean     NOT NULL DEFAULT false,          -- the actor's private_listening at write time (R5)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, kind, episode_id, day)
);
CREATE INDEX activity_feed ON activity (actor_id, created_at DESC, id DESC) WHERE hidden = false;

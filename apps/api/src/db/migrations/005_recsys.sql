-- M8 — For You. specs/008-m8-for-you/data-model.md
--
-- Three things are load-bearing here and easy to "tidy" into a bug:
--
--  1. `subscriptions.deleted_at` is a TOMBSTONE, not a delete. A deleted row cannot sync:
--     phone A unsubscribes, phone B still holds the row, B's next reconcile revives it.
--     Every read of this table must carry `WHERE deleted_at IS NULL` (guard G-M1).
--
--  2. `episodes.published_at` is the PUBLISHER's date. `first_seen_at` is when we saw it,
--     which is a different fact and is useless for freshness. A NULL here is scored as
--     seven days old, never as new (guard G-F1) — a feed with no dates must not win the
--     whole list.
--
--  3. `show_similarity` is between SHOWS, never episodes. An episode is born with no
--     interactions and is most valuable in its first days, so episode-level collaborative
--     filtering would recommend only old episodes, forever, and look fine doing it
--     (research R2). No column here may ever hold a listener id (guard G-R3).

CREATE TABLE subscriptions (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  feed_url    text        NOT NULL,
  starred     boolean     NOT NULL DEFAULT false,   -- M9 lands here early; unused by M8
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL,
  PRIMARY KEY (listener_id, feed_url)
);
CREATE INDEX subscriptions_by_feed ON subscriptions (feed_url) WHERE deleted_at IS NULL;

ALTER TABLE episodes ADD COLUMN published_at timestamptz NULL;
ALTER TABLE episodes ADD COLUMN genre_id     int NULL;
CREATE INDEX episodes_fresh          ON episodes (published_at DESC NULLS LAST);
CREATE INDEX episodes_by_genre_fresh ON episodes (genre_id, published_at DESC);

CREATE TABLE show_similarity (
  show_a      text        NOT NULL,
  show_b      text        NOT NULL,
  sim         real        NOT NULL CHECK (sim > 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (show_a, show_b),
  CHECK (show_a <> show_b)
);
CREATE INDEX show_similarity_neighbours ON show_similarity (show_a, sim DESC);

-- The staging half of the swap: a rebuild interrupted between chunks must never leave
-- half a neighbourhood visible (contracts/api.md, principle IV).
CREATE TABLE show_similarity_next (
  show_a      text        NOT NULL,
  show_b      text        NOT NULL,
  sim         real        NOT NULL CHECK (sim > 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (show_a, show_b),
  CHECK (show_a <> show_b)
);

CREATE TABLE rec_events (
  id          bigserial   PRIMARY KEY,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  episode_id  text        NOT NULL,   -- no FK, like positions: an episode row may be replaced
  channel     text        NOT NULL CHECK (channel IN ('sub-new','showcf','social','genre','talked','pick','chart')),
  rank        smallint    NOT NULL CHECK (rank >= 0),
  kind        text        NOT NULL CHECK (kind IN ('impression','open','play','finish')),
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rec_events_recent  ON rec_events (listener_id, at DESC);
CREATE INDEX rec_events_fatigue ON rec_events (listener_id, episode_id, kind);

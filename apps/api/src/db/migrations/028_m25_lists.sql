-- M25 lane AL (specs/026-m25-control-security-release, Phase 3 A1–A6): admin control over every list.

-- A1: one pin/hide table for every list the phone shows. An item is a show (feed_url, guid NULL),
-- one episode (feed_url + guid) or, for "What listeners said", one comment (comment_id).
-- `position` is the 1-based slot a pin takes in its list (NULL = its place among the pins).
-- `starts_at` / `ends_at` bound when the row counts (NULL = always). One row per item per list:
-- a pin and a hide of the same item cannot both stand (the admin route replaces the old row).
CREATE TABLE IF NOT EXISTS list_overrides (
  id         bigserial   PRIMARY KEY,
  list_id    text        NOT NULL CHECK (list_id ~ '^[a-z][a-zA-Z]{1,30}(:[0-9]{1,6})?$'),
  kind       text        NOT NULL CHECK (kind IN ('pin', 'hide')),
  feed_url   text        NULL CHECK (feed_url IS NULL OR (feed_url ~ '^https?://' AND length(feed_url) <= 2048)),
  guid       text        NULL CHECK (guid IS NULL OR length(guid) BETWEEN 1 AND 1024),
  comment_id uuid        NULL,
  position   int         NULL CHECK (position IS NULL OR position BETWEEN 1 AND 200),
  starts_at  timestamptz NULL,
  ends_at    timestamptz NULL,
  note       text        NULL CHECK (note IS NULL OR length(note) <= 500),
  created_by uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((feed_url IS NOT NULL) <> (comment_id IS NOT NULL)),
  CHECK (comment_id IS NULL OR guid IS NULL),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS list_overrides_one_item
  ON list_overrides (list_id, COALESCE(feed_url, ''), COALESCE(guid, ''), COALESCE(comment_id::text, ''));
CREATE INDEX IF NOT EXISTS list_overrides_by_list ON list_overrides (list_id, kind);

-- The M15 tables move in. They are KEPT (not dropped) so the API still running during the deploy
-- window keeps working; nothing reads them after this lane. A later cleanup drops them.
INSERT INTO list_overrides (list_id, kind, feed_url, guid, position)
  SELECT 'trending', 'pin', feed_url, guid, position FROM trending_pins
  ON CONFLICT DO NOTHING;
INSERT INTO list_overrides (list_id, kind, feed_url, guid)
  SELECT 'trending', 'hide', feed_url, guid FROM trending_hides
  ON CONFLICT DO NOTHING;
INSERT INTO list_overrides (list_id, kind, feed_url, position)
  SELECT 'category:' || genre_id::text, 'pin', feed_url, position FROM category_features
  ON CONFLICT DO NOTHING;

-- A2: per-list settings. Today only the category page's default chip.
CREATE TABLE IF NOT EXISTS list_settings (
  list_id     text        PRIMARY KEY CHECK (list_id ~ '^[a-z][a-zA-Z]{1,30}(:[0-9]{1,6})?$'),
  default_tab text        NULL CHECK (default_tab IS NULL OR default_tab IN ('forYou', 'all', 'newest')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A3: why a show or an episode was hidden (an admin hide asks for it; a report action or a host leaves it NULL).
ALTER TABLE hidden_feeds ADD COLUMN IF NOT EXISTS reason text NULL CHECK (reason IS NULL OR length(reason) <= 500);
ALTER TABLE hidden_episodes ADD COLUMN IF NOT EXISTS reason text NULL CHECK (reason IS NULL OR length(reason) <= 500);

-- A6: For You — a show boosted, buried or never recommended; and the ranking weights.
CREATE TABLE IF NOT EXISTS foryou_rules (
  feed_url   text        PRIMARY KEY CHECK (feed_url ~ '^https?://' AND length(feed_url) <= 2048),
  rule       text        NOT NULL CHECK (rule IN ('boost', 'bury', 'never')),
  note       text        NULL CHECK (note IS NULL OR length(note) <= 500),
  created_by uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS foryou_weights (
  id         int         PRIMARY KEY CHECK (id = 1),
  weights    jsonb       NOT NULL CHECK (jsonb_typeof(weights) = 'object'),
  version    int         NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

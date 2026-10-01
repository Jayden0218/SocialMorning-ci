-- M15 — Admin in the Studio (specs/015-m15-admin/data-model.md).

-- US1: who is admin. Seeded from OWNER_LISTENER_ID when empty (auth/admin.ts).
CREATE TABLE admins (
  listener_id uuid        PRIMARY KEY REFERENCES listeners(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid        NULL
);

-- FR-002: there must always be at least one admin.
CREATE OR REPLACE FUNCTION admins_keep_one() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins) THEN
    RAISE EXCEPTION 'admins_keep_one: there must always be at least one admin';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER admins_keep_one AFTER DELETE ON admins
  FOR EACH STATEMENT EXECUTE FUNCTION admins_keep_one();

-- US1: the record of every admin change. No foreign keys: the record outlives accounts.
-- before/after are objects, never JSON strings (the M14 lesson, guard G-A4).
CREATE TABLE admin_audit (
  id        bigserial   PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  admin_id  uuid        NOT NULL,
  acting_as uuid        NULL,
  area      text        NOT NULL CHECK (area IN ('picks', 'issues', 'collections', 'discover', 'launch', 'accounts', 'users', 'reports')),
  action    text        NOT NULL,
  target    text        NOT NULL,
  before    jsonb       NULL CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
  after     jsonb       NULL CHECK (after IS NULL OR jsonb_typeof(after) = 'object'),
  device    text        NULL
);
CREATE INDEX admin_audit_by_area ON admin_audit (area, id DESC);

-- FR-004: the record cannot be changed (guard G-A3).
CREATE OR REPLACE FUNCTION admin_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION admin_audit_append_only();

-- US2: picks by day. A day with 0 picks is deleted, not kept empty.
CREATE TABLE pick_days (
  day        date        PRIMARY KEY,
  version    int         NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        NULL
);

CREATE TABLE pick_items (
  day      date NOT NULL REFERENCES pick_days(day) ON DELETE CASCADE,
  position int  NOT NULL CHECK (position BETWEEN 1 AND 5),
  feed_url text NOT NULL CHECK (feed_url ~ '^https?://'),
  guid     text NULL,
  why      text NOT NULL CHECK (length(why) BETWEEN 1 AND 140),
  warning  text NULL,
  PRIMARY KEY (day, position)
);

CREATE TABLE curated_issues (
  id         text        PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  day        date        NOT NULL,
  title      text        NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  intro      text        NOT NULL CHECK (length(intro) BETWEEN 1 AND 600),
  retired_at timestamptz NULL,
  version    int         NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE curated_issue_items (
  issue_id text NOT NULL REFERENCES curated_issues(id) ON DELETE CASCADE,
  position int  NOT NULL,
  feed_url text NOT NULL CHECK (feed_url ~ '^https?://'),
  guid     text NULL,
  note     text NOT NULL CHECK (length(note) BETWEEN 1 AND 280),
  PRIMARY KEY (issue_id, position)
);

CREATE TABLE collections (
  id         text        PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  title      text        NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  subtitle   text        NULL CHECK (subtitle IS NULL OR length(subtitle) BETWEEN 1 AND 120),
  position   int         NOT NULL DEFAULT 0,
  retired_at timestamptz NULL,
  version    int         NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- guid and why mirror collections.json's item shape, so a collection moved into the table reads the same.
CREATE TABLE collection_items (
  collection_id text NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  position      int  NOT NULL CHECK (position BETWEEN 1 AND 10),
  feed_url      text NOT NULL CHECK (feed_url ~ '^https?://'),
  guid          text NULL,
  why           text NULL CHECK (why IS NULL OR length(why) BETWEEN 1 AND 140),
  PRIMARY KEY (collection_id, position)
);

-- US5: Discover control, one row.
CREATE TABLE discover_settings (
  id              int    PRIMARY KEY CHECK (id = 1),
  section_order   text[] NOT NULL DEFAULT '{}',
  hidden_sections text[] NOT NULL DEFAULT '{}',
  version         int    NOT NULL DEFAULT 1
);

CREATE TABLE trending_pins (
  position int  PRIMARY KEY CHECK (position BETWEEN 1 AND 3),
  feed_url text NOT NULL,
  guid     text NULL
);

CREATE TABLE trending_hides (
  feed_url text NOT NULL,
  guid     text NOT NULL,
  PRIMARY KEY (feed_url, guid)
);

CREATE TABLE category_features (
  genre_id int  NOT NULL,
  position int  NOT NULL CHECK (position BETWEEN 1 AND 5),
  feed_url text NOT NULL,
  PRIMARY KEY (genre_id, position)
);

-- US3: the owner's own promotions (constitution v2.4.0). No listener column and no IP column (FR-017, guard G-L2).
CREATE TABLE promotions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url   text        NOT NULL CHECK (image_url LIKE 'https://%'),
  image_path  text        NOT NULL,
  image_bytes int         NOT NULL CHECK (image_bytes BETWEEN 1 AND 1048576),
  target_kind text        NOT NULL CHECK (target_kind IN ('route', 'url')),
  target      text        NOT NULL CHECK (target_kind <> 'url' OR target LIKE 'https://%'),
  label       text        NOT NULL DEFAULT 'Promotion' CHECK (length(label) BETWEEN 1 AND 20),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  weight      int         NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 100),
  daily_cap   int         NOT NULL DEFAULT 1 CHECK (daily_cap BETWEEN 1 AND 5),
  impressions bigint      NOT NULL DEFAULT 0,
  taps        bigint      NOT NULL DEFAULT 0,
  retired_at  timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- US4 (D3): one curator per external show — "Shared by", never the host.
CREATE TABLE show_curators (
  feed_url    text        PRIMARY KEY,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        NULL
);

-- US4: a bio, and which admin made the account (FR-019).
ALTER TABLE listeners ADD COLUMN bio text NULL CHECK (bio IS NULL OR length(bio) <= 160);
ALTER TABLE listeners ADD COLUMN made_by uuid NULL;

-- US4 (FR-021): "act as" — null for every normal session.
ALTER TABLE sessions ADD COLUMN acting_admin_id uuid NULL;

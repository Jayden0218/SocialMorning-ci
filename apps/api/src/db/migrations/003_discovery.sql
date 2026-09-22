-- 003_discovery — M5 (specs/005-m5-discovery/data-model.md). One table: cached catalogue
-- responses and computed snapshots. Nothing else: the inputs live in M3/M4's tables.
CREATE TABLE cache (
  key        text        PRIMARY KEY,
  body       jsonb       NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

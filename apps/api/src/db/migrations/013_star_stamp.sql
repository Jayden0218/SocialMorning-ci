-- M12 FR-081 (2026-09-29): a star gets its own time. Starring changes neither `created_at`
-- nor `deleted_at`, so under the M8 row rule (later stamp wins) a star from a phone never
-- beat the server's copy, and the reply to the next sync put the old value back on the
-- phone. The star now merges on its own: the later `starred_at` wins. NULL = never set
-- by a phone that knows about it (the M8 rule still applies to those rows).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS starred_at timestamptz NULL;

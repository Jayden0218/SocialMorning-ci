-- M25 lane GB found on real Postgres: notifications.ref was written as `$4::jsonb` with a JSON
-- string, so the `postgres` driver stored a jsonb STRING ("{\"commentId\":…}") and
-- `ref->>'commentId'` read NULL — every Interactions row lost its excerpt and episode title.
-- The write is fixed in repos/social/notifications.ts; this repairs the rows already stored.
UPDATE notifications SET ref = (ref #>> '{}')::jsonb
WHERE jsonb_typeof(ref) = 'string' AND left(ref #>> '{}', 1) IN ('{', '[');

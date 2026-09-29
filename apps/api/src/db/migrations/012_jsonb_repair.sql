-- Repair jsonb values stored as JSON *strings* (found 2026-09-29 by the M14 e2e on real PostgreSQL;
-- M5 found the same in `cache`). The `postgres` driver double-encodes a string parameter cast
-- `$n::jsonb`; pglite does not, so every unit test was green. Writes now go through `::text`.
-- A value is only ever an object or an array in these columns, so a string is always this defect.
UPDATE listened_ranges SET ranges = (ranges #>> '{}')::jsonb WHERE jsonb_typeof(ranges) = 'string';
UPDATE library_items SET payload = (payload #>> '{}')::jsonb WHERE jsonb_typeof(payload) = 'string';
UPDATE show_overrides SET hosts = (hosts #>> '{}')::jsonb WHERE jsonb_typeof(hosts) = 'string';
UPDATE show_overrides SET links = (links #>> '{}')::jsonb WHERE jsonb_typeof(links) = 'string';
UPDATE show_overrides SET contacts = (contacts #>> '{}')::jsonb WHERE jsonb_typeof(contacts) = 'string';

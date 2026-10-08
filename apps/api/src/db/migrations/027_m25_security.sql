-- M25 lane SA (spec 026, Phase 1 security). One schema change, no new table.

-- S5: an email change also needs a code sent to the OLD address. Only its hash is kept, like the
-- new address's code. NULL = a change started before this migration: it can no longer be confirmed
-- (the route asks for both codes), so the listener starts again.
ALTER TABLE email_changes ADD COLUMN IF NOT EXISTS old_code_hash bytea NULL;

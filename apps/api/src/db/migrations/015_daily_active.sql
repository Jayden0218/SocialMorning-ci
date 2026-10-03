-- M18 — Admin dashboard (specs/019-m18-admin-dashboard/data-model.md).
-- One row per person per calendar day (UTC+8) of app use: the day and the account, nothing else
-- (FR-014). Written by listenerForToken in the statement that already bumps last_seen_at (R1).
-- Deleted with the account (FR-015) and after 400 days by the hourly rebuild (R8).
CREATE TABLE daily_active (
  day         date NOT NULL,
  listener_id uuid NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  PRIMARY KEY (day, listener_id)
);

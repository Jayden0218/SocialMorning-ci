#!/bin/sh
# M23 US13 (guard G-M23-10): the nightly backup refuses to start without what it needs.
# Called by .github/workflows/backup.yml (private repo only) before anything is installed
# or dumped. Reads NEON_BACKUP_URL and BACKUP_AGE_RECIPIENT from the environment.
#
# It never prints the database address — only whether it is there and well-formed.
# Exit 0 = go; exit 1 = a clear message saying what to set, and nothing else happens.
set -u
fail=0
if [ -z "${NEON_BACKUP_URL:-}" ]; then
  echo "backup refused: the secret NEON_BACKUP_URL is not set (Settings → Secrets and variables → Actions → Secrets)." >&2
  fail=1
else
  case "$NEON_BACKUP_URL" in
    postgres://*|postgresql://*) ;;
    *) echo "backup refused: NEON_BACKUP_URL is not a postgres:// connection string." >&2; fail=1 ;;
  esac
  # Neon: pg_dump must use the direct host — the pooler (PgBouncer, transaction mode) drops
  # pg_dump's session settings (neon.com/docs/manage/backup-pg-dump).
  case "$NEON_BACKUP_URL" in
    *-pooler.*|*-pooler:*|*-pooler/*) echo "backup refused: NEON_BACKUP_URL uses the pooled host (-pooler); use the direct (unpooled) connection string." >&2; fail=1 ;;
  esac
fi
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  echo "backup refused: the variable BACKUP_AGE_RECIPIENT (the owner's age public key, age1…) is not set (Settings → Secrets and variables → Actions → Variables)." >&2
  fail=1
else
  case "$BACKUP_AGE_RECIPIENT" in
    age1*) ;;
    *) echo "backup refused: BACKUP_AGE_RECIPIENT is not an age public key (it must start with age1). Never put the private key (AGE-SECRET-KEY-…) here." >&2; fail=1 ;;
  esac
fi
[ "$fail" -eq 0 ] && echo "backup preflight: database address and encryption key present."
exit "$fail"

#!/bin/sh
# Guard G-M23-10 (M23 US13): the backup job refuses to run without its key or its database
# address, and never prints the address. Run by the gate (ci/workflows/gate.yml); the
# backup workflow itself never leaves the private repo.
#
# The break that turns it red: make scripts/backup-preflight.sh `exit 0` at the top, or
# drop the BACKUP_AGE_RECIPIENT check.
set -u
cd "$(dirname "$0")"
URL='postgresql://reader:not-a-real-password@ep-quiet-sea-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
KEY='age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq'
bad=0
expect() { # expect <want-exit> <name> <url> <key>
  out=$(env -u NEON_BACKUP_URL -u BACKUP_AGE_RECIPIENT ${3:+NEON_BACKUP_URL="$3"} ${4:+BACKUP_AGE_RECIPIENT="$4"} sh ./backup-preflight.sh 2>&1); got=$?
  if [ "$got" -ne "$1" ]; then echo "FAIL $2: exit $got, wanted $1 — $out"; bad=1; return; fi
  case "$out" in *not-a-real-password*|*ep-quiet-sea*) echo "FAIL $2: the database address was printed"; bad=1; return ;; esac
  echo "ok   $2"
}
expect 1 'no key, no address'      ''  ''
expect 1 'address but no key'      "$URL" ''
expect 1 'key but no address'      ''  "$KEY"
expect 1 'a private key as the key' "$URL" 'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ'
expect 1 'the pooled host'         'postgresql://reader:not-a-real-password@ep-quiet-sea-123456-pooler.ap-southeast-1.aws.neon.tech/neondb' "$KEY"
expect 1 'not a postgres address'  'https://ep-quiet-sea.example' "$KEY"
expect 0 'both present'            "$URL" "$KEY"
[ "$bad" -eq 0 ] && echo "backup preflight: 7 of 7" || { echo "backup preflight: FAILED"; exit 1; }

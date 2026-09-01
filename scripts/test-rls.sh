#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Spins up a throwaway Postgres, applies the real migrations on top of a small
# Supabase shim, and runs the adversarial RLS suite against it.
#
#   ./scripts/test-rls.sh
#
# Requires postgresql@17 (brew install postgresql@17). Needs no Docker and
# never touches the hosted project.
# ---------------------------------------------------------------------------
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
export PATH="$PGBIN:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PGDATA="$(mktemp -d -t furnace-pg)"
PGPORT="${PGPORT:-55433}"
PGHOST="$PGDATA"

cleanup() {
  pg_ctl -D "$PGDATA" -s -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

echo "==> initdb ($PGDATA)"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null

echo "==> starting postgres on port $PGPORT"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGDATA -c listen_addresses=''" -w -s start

psql_() { psql -q -v ON_ERROR_STOP=1 -h "$PGDATA" -p "$PGPORT" -U postgres -d furnace_test "$@"; }

createdb -h "$PGDATA" -p "$PGPORT" -U postgres furnace_test

echo "==> applying shim"
psql_ -f "$ROOT/supabase/tests/00_local_shim.sql" >/dev/null

echo "==> applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    - $(basename "$f")"
  psql_ -f "$f" >/dev/null
done

echo "==> re-running the RLS assertion function"
psql_ -c "select public.assert_rls_sane();" | grep -o 'furnace:.*'

echo "==> running RLS suite"
psql -v ON_ERROR_STOP=1 -h "$PGDATA" -p "$PGPORT" -U postgres -d furnace_test \
     -f "$ROOT/supabase/tests/01_rls_isolation_test.sql" 2>&1 |
  grep -E 'PASS|FAIL|NOTICE|ERROR|===|#|ALL RLS' || true

# psql exits non-zero on any raised exception thanks to ON_ERROR_STOP.
status="${PIPESTATUS[0]}"
exit "$status"

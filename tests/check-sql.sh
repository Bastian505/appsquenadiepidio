#!/usr/bin/env bash
# Prueba la migración de cuentas compartidas contra un Postgres local (sin tocar Supabase).
# Uso: bash tests/check-sql.sh   (requiere postgresql-16 instalado)
set -euo pipefail
# Usa un Postgres ya disponible (PGHOST/PGPORT, como en CI) o levanta uno local en un socket.
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}; PORT=${PGPORT:-55432}
SOCK=${PGHOST:-${PGSOCK:-/tmp/pgsock}}; DATA=${PGDATA_TEST:-/tmp/pgdata}; USER_=${PGUSER:-postgres}
if ! psql -h "$SOCK" -p "$PORT" -U "$USER_" -tAc 'select 1' >/dev/null 2>&1; then
  mkdir -p "$DATA" "$SOCK"; chown -R postgres:postgres "$DATA" "$SOCK" 2>/dev/null || true
  mkdir -p "$SOCK" 2>/dev/null || true; su postgres -c "$PGBIN/initdb -D $DATA -A trust -U "$USER_"" >/dev/null 2>&1 || true
  su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k $SOCK -c listen_addresses=' -l $DATA/pg.log start" >/dev/null 2>&1
  sleep 2
fi
DB=dc_test_$RANDOM
psql -h "$SOCK" -p "$PORT" -U "$USER_" -qc "create database $DB" >/dev/null
trap 'psql -h "$SOCK" -p "$PORT" -U "$USER_" -qc "drop database if exists $DB" >/dev/null 2>&1' EXIT
OUT=$(psql -h "$SOCK" -p "$PORT" -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -f tests/sql/shim_supabase.sql \
  -f supabase/migrations/20261002_shared_bills.sql \
  -f supabase/migrations/20261003_share_token_no_padding.sql \
  -f supabase/migrations/20261004_join_by_name.sql \
  -f supabase/migrations/20261005_host_marks_for_members.sql \
  -f tests/sql/test_shared_bills.sql 2>&1)
echo "$OUT" | grep -E '(NOTICE:|WARNING:|ERROR:|FATAL:|^──|^✓|^✗)' | sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //; s/^WARNING:  /FALLA> /'
# Debe pasar TODO y no puede haber ningún error de SQL (una prueba que no corre no es una prueba que pasa).
if echo "$OUT" | grep -qE '(^|:)(ERROR|FATAL)'; then echo "FALLÓ: hubo errores de SQL"; exit 1; fi
echo "$OUT" | grep -q '✓ todas las comprobaciones' || { echo "FALLÓ"; exit 1; }

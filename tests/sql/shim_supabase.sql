-- Simula lo mínimo de Supabase para probar la migración en un Postgres local:
-- esquema auth, auth.users, auth.uid() leído de una variable de sesión, y el rol "authenticated".
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

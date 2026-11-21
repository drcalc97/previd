-- Supabase platform hardening.
-- Supabase exposes the `public` schema through an HTTP Data API (PostgREST) to the roles `anon` (public key) and
-- `authenticated`, and by default grants those roles access to every new table/sequence/function in `public`.
-- PreVid reaches Postgres ONLY as `previd_app` (server-side). Close every other door, and make the tables that
-- carry no tenant data subject to RLS too, so nothing relies on a grant staying absent.
-- Safe on plain PostgreSQL: the roles are only touched if they exist.

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      -- objects created later by the migration role must not be re-exposed by default privileges
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;

-- RLS on the two tables that previously had none; the app role keeps exactly the access it had.
alter table identity_links enable row level security;
create policy identity_links_app on identity_links for all to previd_app using (true) with check (true);

alter table rate_limits enable row level security;
create policy rate_limits_app on rate_limits for all to previd_app using (true) with check (true);

-- Ensure no PreVid function is executable by PUBLIC (explicit, in case defaults differ per platform).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('app_user_id','app_org_id','app_is_member','app_find_user_id_by_email','rate_limit_hit','system_due_recordings',
       'system_mark_object_deleted','system_cleanup','system_upload_allowed','recordings_freeze',
       'patient_scrub_internal','patient_scrub_if_unused')
  loop
    execute format('revoke all on function %s from public', f.sig);
  end loop;
end $$;
-- app_user_id/app_org_id/rate_limit_hit etc. keep their explicit grants to previd_app from earlier migrations.

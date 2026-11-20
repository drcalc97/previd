-- Security hardening following the independent review (docs/security/FINDINGS_REGISTER.md).

-- SEC-011: SECURITY DEFINER functions must not resolve names via the caller's pg_temp schema.
alter function app_is_member(uuid, text[])        set search_path = pg_catalog, public, pg_temp;
alter function app_find_user_id_by_email(text)    set search_path = pg_catalog, public, pg_temp;
alter function system_due_recordings(integer)     set search_path = pg_catalog, public, pg_temp;
alter function system_mark_object_deleted(uuid)   set search_path = pg_catalog, public, pg_temp;
alter function system_cleanup()                   set search_path = pg_catalog, public, pg_temp;

-- SEC-011: the app role must not create temp objects or objects in the public schema.
revoke create on schema public from public;
revoke create on schema public from previd_app;
do $$
begin
  execute format('revoke temp on database %I from public', current_database());
  execute format('revoke temp on database %I from previd_app', current_database());
exception when insufficient_privilege then
  -- Managed platforms may not let the migration role change database-level grants: verify manually (DEPLOYMENT.md).
  raise warning 'could not revoke TEMP on database; verify manually';
end $$;

-- SEC-001/002: only addresses whose control has been proven (email verification, set by the hosted identity
-- adapter when an emailed invitation is accepted) can be added to a second organisation.
alter table users add column email_verified_at timestamptz;

create or replace function app_find_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select id from users
  where email = lower(p_email) and email_verified_at is not null
    and app_org_id() is not null and app_is_member(app_org_id(), array['org_admin'])
$$;

-- SEC-003/004: an upload is only accepted while its recording row is still pending (single effective use,
-- impossible after complete/delete/purge).
create function system_upload_allowed(p_key text) returns boolean
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from recordings
                 where storage_key = p_key and status = 'pending_upload' and recorded_at > now() - interval '1 day')
$$;
revoke all on function system_upload_allowed(text) from public;
grant execute on function system_upload_allowed(text) to previd_app;

-- SEC-014: audit actor must be the caller (or null for pre-authentication events).
drop policy audit_insert on audit_events;
create policy audit_insert on audit_events for insert to previd_app
  with check ((org_id is null or (org_id = app_org_id() and app_is_member(org_id)))
              and (actor_user_id is null or actor_user_id = app_user_id()));

-- SEC-014: users may only change their own display name (not email/status/id).
revoke update on users from previd_app;
grant update (display_name) on users to previd_app;

-- SEC-014: immutable recording columns are frozen at the database level.
create function recordings_freeze() returns trigger language plpgsql as $$
begin
  if new.org_id <> old.org_id or new.patient_id <> old.patient_id or new.recorded_by <> old.recorded_by
     or new.storage_key <> old.storage_key or new.idempotency_key <> old.idempotency_key
     or new.identity_verified_at <> old.identity_verified_at or new.identity_checks <> old.identity_checks then
    raise exception 'immutable recording column modified' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger recordings_freeze_trg before update on recordings for each row execute function recordings_freeze();

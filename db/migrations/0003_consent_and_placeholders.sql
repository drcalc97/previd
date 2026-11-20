-- Owner decision (ADR-017): consent is confirmed as part of EVERY recording, and a patient is only added to the system
-- at that moment. MDT lists may hold an identity-free placeholder ("No PreVid for patient N").

-- ---------------------------------------------------------------- consent on recordings
alter table recordings add column consent_confirmed_at timestamptz;
alter table recordings add column consent_confirmed_by uuid references users(id);
update recordings set consent_confirmed_at = recorded_at, consent_confirmed_by = recorded_by where consent_confirmed_at is null;  -- synthetic dev data only
alter table recordings alter column consent_confirmed_at set not null;
alter table recordings alter column consent_confirmed_by set not null;

create or replace function recordings_freeze() returns trigger language plpgsql as $$
begin
  if new.org_id <> old.org_id or new.patient_id <> old.patient_id or new.recorded_by <> old.recorded_by
     or new.storage_key <> old.storage_key or new.idempotency_key <> old.idempotency_key
     or new.identity_verified_at <> old.identity_verified_at or new.identity_checks <> old.identity_checks
     or new.consent_confirmed_at <> old.consent_confirmed_at or new.consent_confirmed_by <> old.consent_confirmed_by then
    raise exception 'immutable recording column modified' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- patient minimisation
-- Internal: removes identifying details of a patient who has no live (available / pending) recording.
-- The row is kept (tombstoned recordings reference it) but holds no name, DOB, NHS number or reference.
create function patient_scrub_internal(p_org uuid, p_patient uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not exists (select 1 from recordings where org_id = p_org and patient_id = p_patient and status in ('available', 'pending_upload')) then
    update patients set given_name = 'Removed', family_name = 'Removed', date_of_birth = date '1900-01-01', nhs_number = null,
                        synthetic_ref = 'REMOVED-' || substr(id::text, 1, 8), archived_at = coalesce(archived_at, now())
    where id = p_patient and org_id = p_org and given_name <> 'Removed';
  end if;
end $$;
revoke all on function patient_scrub_internal(uuid, uuid) from public;

-- Callable by the app for its own organisation (clinicians/admins): used after a deletion or failed upload.
create function patient_scrub_if_unused(p_org uuid, p_patient uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if p_org is distinct from app_org_id() or not app_is_member(p_org, array['org_admin', 'clinician']) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  perform patient_scrub_internal(p_org, p_patient);
end $$;
revoke all on function patient_scrub_if_unused(uuid, uuid) from public;
grant execute on function patient_scrub_if_unused(uuid, uuid) to previd_app;

-- Retention / abandoned-upload sweep also scrubs patients left with no recording.
create or replace function system_mark_object_deleted(p_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r recordings%rowtype; v_reason text;
begin
  select * into r from recordings where recordings.id = p_id for update;
  if not found then return false; end if;
  if not ((r.status = 'available' and r.purge_after < now())
       or (r.status = 'pending_upload' and r.recorded_at < now() - interval '24 hours')
       or (r.status in ('deleted','failed') and r.storage_deleted_at is null)) then
    return false;
  end if;
  v_reason := case when r.status = 'available' then 'retention_expired'
                   when r.status = 'pending_upload' then 'upload_abandoned' else r.delete_reason end;
  update recordings set
    status = case when status in ('available','pending_upload') then 'deleted' else status end,
    deleted_at = coalesce(deleted_at, now()),
    delete_reason = coalesce(delete_reason, v_reason),
    storage_deleted_at = now()
  where recordings.id = p_id;
  insert into audit_events(org_id, action, target_type, target_id, outcome, metadata)
  values (r.org_id, 'recording.purge', 'recording', r.id, 'success', jsonb_build_object('reason', v_reason));
  perform patient_scrub_internal(r.org_id, r.patient_id);
  return true;
end $$;

-- ---------------------------------------------------------------- MDT placeholders (no identity stored)
-- Shares the `position` ordering with mdt_meeting_patients; the label "No PreVid for patient N" is derived from order.
create table mdt_meeting_placeholders (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  meeting_id uuid not null,
  position   integer not null,
  added_at   timestamptz not null default now(),
  foreign key (org_id, meeting_id) references mdt_meetings(org_id, id) on delete cascade
);
alter table mdt_meeting_placeholders enable row level security;
create policy mdtph_select on mdt_meeting_placeholders for select to previd_app
  using (org_id = app_org_id() and app_is_member(org_id));
create policy mdtph_insert on mdt_meeting_placeholders for insert to previd_app
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));
create policy mdtph_delete on mdt_meeting_placeholders for delete to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));
grant select, insert, delete on mdt_meeting_placeholders to previd_app;

-- PreVid core schema. Plain PostgreSQL: no Supabase-specific objects.
-- Applied by the OWNER role (DATABASE_ADMIN_URL). The application connects as
-- the non-owner role `previd_app`, so Row Level Security applies to it.

-- ---------------------------------------------------------------- app role
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'previd_app') then
    create role previd_app nologin;   -- login + password are set out-of-band (scripts/db-setup.ts)
  end if;
end $$;

-- ------------------------------------------------- session context helpers
-- The application sets these with set_config(..., true) (transaction-local)
-- inside every request transaction. RLS then reads them.
create function app_user_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app_org_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

-- ----------------------------------------------------------------- tables
create table organisations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(name) between 2 and 120),
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  -- MVP guardrail: only synthetic organisations may exist until governance approvals are complete.
  is_synthetic boolean not null default true,
  status       text not null default 'active' check (status in ('active','suspended')),
  created_at   timestamptz not null default now(),
  constraint mvp_synthetic_only check (is_synthetic)
);

create table org_settings (
  org_id           uuid primary key references organisations(id) on delete cascade,
  retention_days   integer not null default 365 check (retention_days between 1 and 3650),
  max_duration_sec integer not null default 180 check (max_duration_sec between 10 and 900),
  max_file_bytes   bigint  not null default 157286400 check (max_file_bytes between 1048576 and 524288000),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);

create table users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique check (email = lower(email) and length(email) <= 254),
  display_name text not null check (length(display_name) between 1 and 120),
  status       text not null default 'active' check (status in ('active','disabled')),
  created_at   timestamptz not null default now()
);

-- Maps an external identity (Supabase Auth, Entra ID, local dev) to a stable app user.
create table identity_links (
  provider text not null,
  subject  text not null,
  user_id  uuid not null references users(id) on delete cascade,
  primary key (provider, subject)
);

create table memberships (
  org_id     uuid not null references organisations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('org_admin','clinician','mdt_reviewer')),
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table patients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  synthetic_ref text not null check (length(synthetic_ref) between 1 and 40),
  given_name    text not null check (length(given_name) between 1 and 80),
  family_name   text not null check (length(family_name) between 1 and 80),
  date_of_birth date not null check (date_of_birth between date '1900-01-01' and current_date),
  nhs_number    text check (nhs_number ~ '^[0-9]{10}$'),   -- SYNTHETIC values only in MVP
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (org_id, id),
  unique (org_id, synthetic_ref)
);
create index patients_org_name_idx on patients(org_id, family_name, given_name);

create table recordings (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organisations(id) on delete cascade,
  patient_id           uuid not null,
  recorded_by          uuid not null references users(id),
  -- Identity verification captured BEFORE recording (wrong-patient hazard control).
  identity_verified_at timestamptz not null,
  identity_checks      text[] not null check (identity_checks <@ array['name','dob','nhs_number']
                                              and cardinality(identity_checks) >= 2),
  status               text not null default 'pending_upload'
                         check (status in ('pending_upload','available','failed','deleted')),
  storage_key          text not null unique,      -- opaque, provider-independent key
  mime_type            text,
  declared_size_bytes  bigint check (declared_size_bytes > 0),
  size_bytes           bigint check (size_bytes > 0),
  duration_sec         integer check (duration_sec between 1 and 900),
  idempotency_key      text not null check (length(idempotency_key) between 16 and 80),
  recorded_at          timestamptz not null default now(),
  uploaded_at          timestamptz,
  purge_after          timestamptz,
  deleted_at           timestamptz,
  deleted_by           uuid references users(id),
  storage_deleted_at   timestamptz,           -- set once the stored object has been removed
  delete_reason        text check (delete_reason in
                         ('wrong_patient','poor_quality','recorded_in_error','retention_expired','upload_abandoned','admin_request')),
  unique (org_id, id),
  unique (org_id, idempotency_key),
  foreign key (org_id, patient_id) references patients(org_id, id)   -- DB-enforced tenant consistency
);
create index recordings_patient_idx on recordings(org_id, patient_id, recorded_at desc);
create index recordings_purge_idx on recordings(purge_after) where status = 'available';

create table mdt_meetings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  title         text not null check (length(title) between 1 and 120),
  scheduled_for timestamptz not null,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (org_id, id)
);

create table mdt_meeting_patients (
  org_id     uuid not null,
  meeting_id uuid not null,
  patient_id uuid not null,
  position   integer not null default 0,
  added_at   timestamptz not null default now(),
  primary key (meeting_id, patient_id),
  foreign key (org_id, meeting_id) references mdt_meetings(org_id, id) on delete cascade,
  foreign key (org_id, patient_id) references patients(org_id, id)
);

-- Append-only audit log. IDs and enumerated codes only: NO patient names, DOBs, NHS numbers, free text.
create table audit_events (
  id            bigint generated always as identity primary key,
  org_id        uuid references organisations(id),
  actor_user_id uuid,
  action        text not null check (length(action) <= 64),
  target_type   text check (length(target_type) <= 32),
  target_id     uuid,
  outcome       text not null check (outcome in ('success','denied','error')),
  ip_hash       text,
  metadata      jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 1024),
  occurred_at   timestamptz not null default now()
);
create index audit_org_time_idx on audit_events(org_id, occurred_at desc);

-- Postgres-backed rate limiting (fixed window).
create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);

-- Returns true if the call is ALLOWED, false if the limit is exceeded.
create function rate_limit_hit(p_key text, p_window_sec integer, p_limit integer)
returns boolean language plpgsql as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  h integer;
begin
  insert into rate_limits(key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = rate_limits.hits + 1
  returning hits into h;
  return h <= p_limit;
end $$;

-- -------------------------------------------------- membership helper (RLS)
-- SECURITY DEFINER so policies can consult memberships without recursion.
-- The membership test is independent of anything the app claims about org/role.
create function app_is_member(p_org uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    join users u on u.id = m.user_id
    join organisations o on o.id = m.org_id
    where m.org_id = p_org
      and m.user_id = app_user_id()
      and m.status = 'active' and u.status = 'active' and o.status = 'active'
      and (p_roles is null or m.role = any(p_roles))
  ) $$;

-- Used when an org admin adds an existing person to their organisation. Returns only an id.
create function app_find_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from users where email = lower(p_email)
    and app_org_id() is not null and app_is_member(app_org_id(), array['org_admin'])
$$;

revoke all on function app_is_member(uuid, text[]) from public;
revoke all on function app_find_user_id_by_email(text) from public;
grant execute on function app_user_id(), app_org_id(), rate_limit_hit(text,integer,integer),
  app_is_member(uuid, text[]), app_find_user_id_by_email(text) to previd_app;

-- --------------------------------------------------------------------- RLS
alter table organisations         enable row level security;
alter table org_settings          enable row level security;
alter table users                 enable row level security;
alter table memberships           enable row level security;
alter table patients              enable row level security;
alter table recordings            enable row level security;
alter table mdt_meetings          enable row level security;
alter table mdt_meeting_patients  enable row level security;
alter table audit_events          enable row level security;
-- identity_links and rate_limits hold no tenant data; identity_links is never granted to the app role.

create policy org_select on organisations for select to previd_app using (app_is_member(id));

create policy settings_select on org_settings for select to previd_app
  using (org_id = app_org_id() and app_is_member(org_id));
create policy settings_update on org_settings for update to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin']))
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin']));

create policy users_select on users for select to previd_app using (
  id = app_user_id()
  or (app_org_id() is not null and app_is_member(app_org_id())
      and exists (select 1 from memberships m where m.user_id = users.id and m.org_id = app_org_id()))
);
create policy users_insert on users for insert to previd_app
  with check (app_org_id() is not null and app_is_member(app_org_id(), array['org_admin']));
create policy users_update_self on users for update to previd_app
  using (id = app_user_id()) with check (id = app_user_id());

create policy memberships_select on memberships for select to previd_app using (
  user_id = app_user_id() or (org_id = app_org_id() and app_is_member(org_id))
);
create policy memberships_insert on memberships for insert to previd_app
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin']));
create policy memberships_update on memberships for update to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin']))
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin']));

create policy patients_select on patients for select to previd_app
  using (org_id = app_org_id() and app_is_member(org_id));
create policy patients_insert on patients for insert to previd_app
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));
create policy patients_update on patients for update to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']))
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));

create policy recordings_select on recordings for select to previd_app
  using (org_id = app_org_id() and app_is_member(org_id));
create policy recordings_insert on recordings for insert to previd_app
  with check (org_id = app_org_id() and recorded_by = app_user_id()
              and app_is_member(org_id, array['org_admin','clinician']));
create policy recordings_update on recordings for update to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']))
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));

create policy mdt_select on mdt_meetings for select to previd_app
  using (org_id = app_org_id() and app_is_member(org_id));
create policy mdt_insert on mdt_meetings for insert to previd_app
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));
create policy mdt_update on mdt_meetings for update to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']))
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));
create policy mdt_delete on mdt_meetings for delete to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));

create policy mdtp_select on mdt_meeting_patients for select to previd_app
  using (org_id = app_org_id() and app_is_member(org_id));
create policy mdtp_insert on mdt_meeting_patients for insert to previd_app
  with check (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));
create policy mdtp_delete on mdt_meeting_patients for delete to previd_app
  using (org_id = app_org_id() and app_is_member(org_id, array['org_admin','clinician']));

create policy audit_select on audit_events for select to previd_app
  using (org_id is not null and org_id = app_org_id() and app_is_member(org_id, array['org_admin']));
create policy audit_insert on audit_events for insert to previd_app
  with check (org_id is null or (org_id = app_org_id() and app_is_member(org_id)));

-- ------------------------------------------------------------------ grants
revoke all on all tables in schema public from public;
grant usage on schema public to previd_app;
grant select                          on organisations         to previd_app;
grant select, update                  on org_settings          to previd_app;
grant select, insert, update          on users                 to previd_app;
grant select, insert, update          on memberships           to previd_app;
grant select, insert, update          on patients              to previd_app;
grant select, insert, update          on recordings            to previd_app;
grant select, insert, update, delete  on mdt_meetings          to previd_app;
grant select, insert, delete          on mdt_meeting_patients  to previd_app;
grant select, insert                  on audit_events          to previd_app;   -- append-only for the app
grant select, insert, update, delete  on rate_limits           to previd_app;
grant usage on sequence audit_events_id_seq to previd_app;

grant select, insert on identity_links to previd_app;   -- subject -> user mapping; holds no tenant data

-- ------------------------------------------------------ system (cron) functions
-- Retention/cleanup runs with no user session, so RLS would hide everything. These narrowly-scoped
-- SECURITY DEFINER functions are the ONLY privileged path; each re-checks that the row is genuinely due.
create function system_due_recordings(p_limit integer)
returns table (id uuid, org_id uuid, storage_key text, reason text)
language sql stable security definer set search_path = public as $$
  select r.id, r.org_id, r.storage_key,
         case when r.status = 'available' then 'retention_expired'
              when r.status = 'pending_upload' then 'upload_abandoned'
              else coalesce(r.delete_reason, 'admin_request') end
  from recordings r
  where (r.status = 'available' and r.purge_after < now())
     or (r.status = 'pending_upload' and r.recorded_at < now() - interval '24 hours')
     or (r.status in ('deleted','failed') and r.storage_deleted_at is null)
  order by r.recorded_at
  limit p_limit $$;

create function system_mark_object_deleted(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
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
  return true;
end $$;

create function system_cleanup() returns void language sql security definer set search_path = public as $$
  delete from rate_limits where window_start < now() - interval '2 days' $$;

revoke all on function system_due_recordings(integer), system_mark_object_deleted(uuid), system_cleanup() from public;
grant execute on function system_due_recordings(integer), system_mark_object_deleted(uuid), system_cleanup() to previd_app;

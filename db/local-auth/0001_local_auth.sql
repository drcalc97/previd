-- DEVELOPMENT/TEST ONLY identity provider tables (AUTH_PROVIDER=local).
-- Not applied in a Supabase/Entra deployment. Kept in a separate schema so it can never
-- be confused with domain data.
create schema if not exists local_auth;

create table local_auth.credentials (
  user_id          uuid primary key references public.users(id) on delete cascade,
  email            text not null unique,
  password_hash    text not null,
  totp_secret_enc  text,                  -- AES-256-GCM encrypted
  totp_enrolled_at timestamptz,
  last_totp_step   bigint,                -- replay protection
  failed_attempts  integer not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now()
);

create table local_auth.sessions (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,   -- SHA-256 of the opaque cookie token
  user_id         uuid not null references public.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_seen_at    timestamptz not null default now(),
  mfa_verified_at timestamptz,
  revoked_at      timestamptz
);
create index on local_auth.sessions(user_id);

grant usage on schema local_auth to previd_app;
grant select, insert, update, delete on local_auth.credentials to previd_app;
grant select, insert, update, delete on local_auth.sessions to previd_app;

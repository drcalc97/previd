-- Links a CONFIRMED Supabase Auth identity to the application user with the same email on first sign-in.
-- Accounts are only ever created by invitation (public sign-ups are disabled), so a confirmed address proves control of the inbox.
-- The caller (server code) must only pass identities whose email_confirmed_at is set.
create function identity_link_supabase(p_subject text, p_email text) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v uuid;
begin
  select user_id into v from identity_links where provider = 'supabase' and subject = p_subject;
  if v is not null then return v; end if;
  select id into v from users where email = lower(p_email) and status = 'active';
  if v is null then return null; end if;
  -- one application user can only ever be bound to ONE Supabase identity (blocks re-binding / takeover)
  if exists (select 1 from identity_links where provider = 'supabase' and user_id = v) then return null; end if;
  insert into identity_links(provider, subject, user_id) values ('supabase', p_subject, v);
  update users set email_verified_at = coalesce(email_verified_at, now()) where id = v;
  return v;
end $$;
revoke all on function identity_link_supabase(text, text) from public;
grant execute on function identity_link_supabase(text, text) to previd_app;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function identity_link_supabase(text, text) from anon, authenticated;
  end if;
end $$;

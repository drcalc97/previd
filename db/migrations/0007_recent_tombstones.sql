-- Recently deleted/failed recordings whose signed upload URL may still be valid (Supabase signed upload URLs last ~2 h).
-- The retention sweep re-deletes their objects (idempotent) so a replayed URL cannot resurrect deleted video (SEC-004).
create function system_recent_tombstones(p_limit integer)
returns table (id uuid, storage_key text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.storage_key
  from recordings r
  where r.status in ('deleted', 'failed') and r.storage_deleted_at is not null
    and r.storage_deleted_at > now() - interval '3 hours'
  order by r.storage_deleted_at desc
  limit p_limit $$;
revoke all on function system_recent_tombstones(integer) from public;
grant execute on function system_recent_tombstones(integer) to previd_app;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function system_recent_tombstones(integer) from anon, authenticated;
  end if;
end $$;

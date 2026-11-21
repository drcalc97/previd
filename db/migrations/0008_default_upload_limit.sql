-- Default per-recording size limit lowered to 50 MB to match the Supabase Free plan's per-object cap (the bucket also enforces it).
-- Organisations on a plan with a higher storage cap can raise it in settings (up to 500 MB).
alter table org_settings alter column max_file_bytes set default 52428800;
update org_settings set max_file_bytes = 52428800 where max_file_bytes = 157286400;

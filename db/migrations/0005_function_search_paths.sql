-- Pin search_path on the remaining (SECURITY INVOKER) helper functions (Supabase advisor: function_search_path_mutable).
alter function app_user_id()                                  set search_path = pg_catalog, public, pg_temp;
alter function app_org_id()                                   set search_path = pg_catalog, public, pg_temp;
alter function rate_limit_hit(text, integer, integer)         set search_path = pg_catalog, public, pg_temp;
alter function recordings_freeze()                            set search_path = pg_catalog, public, pg_temp;

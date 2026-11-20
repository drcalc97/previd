-- SEC-007: TOTP failures are counted separately so a correct password cannot reset them.
alter table local_auth.credentials add column totp_failed_attempts integer not null default 0;

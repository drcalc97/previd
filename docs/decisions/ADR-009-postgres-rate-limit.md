# ADR-009 Postgres-backed rate limiting

Status: Accepted

## Context
Owner asked for rate limiting aligned with Cyber Essentials themes (password-guessing protection); avoid Redis/Upstash.

## Decision
Fixed-window counters in Postgres via rate_limit_hit(); keyed-hash IPs; account lockout after 5 failures for 15 min.

## Consequences
Adequate at MVP scale; trusts platform-set x-forwarded-for (verify on Vercel). Cyber Essentials does not prescribe rate limiting and certifies an organisation, not an app.

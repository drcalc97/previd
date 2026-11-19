# ADR-002 Application-level user identifiers

Status: Accepted

## Context
Core data must survive a move from Supabase Auth to Entra ID.

## Decision
`users` has its own UUID; `identity_links(provider, subject)` maps external identities. No provider objects in domain code.

## Consequences
Identity migration is an adapter + link-import exercise; slightly more code now.

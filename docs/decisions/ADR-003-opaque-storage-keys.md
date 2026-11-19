# ADR-003 Opaque storage keys, no stored URLs

Status: Accepted

## Context
Storage providers differ (Supabase, S3, Blob); URLs leak and expire.

## Decision
Store only keys of the form o/{org}/r/{recording}. Playback/upload URLs are minted per request and short-lived.

## Consequences
Objects copy 1:1 between providers; no durable video links exist.

# ADR-013 Local development identity and storage adapters

Status: Accepted

## Context
Supabase is not connected during initial build; tests need a real stack.

## Decision
Implement scrypt+TOTP+session identity and filesystem storage behind the same ports; refuse to run in production unless explicitly overridden.

## Consequences
Real, tested flows today; adds security-sensitive code that must never ship to production; Supabase adapters replace it.

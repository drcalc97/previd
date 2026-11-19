# ADR-001 Modular monolith on Next.js App Router

Status: Accepted

## Context
Sole developer, low budget, need for fast iteration and a simple deployable.

## Decision
One Next.js application with clear internal modules (domain, services, ports, adapters). No microservices or Edge Functions.

## Consequences
Lowest cost and complexity; modules can be split later if scale demands.

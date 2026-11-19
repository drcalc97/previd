# ADR-004 Direct-to-storage upload

Status: Accepted

## Context
Serverless request bodies are small (~4.5 MB on Vercel); videos up to 150 MB.

## Decision
Server issues a short-lived signed upload target and verifies the object on completion (size + container magic bytes).

## Consequences
Needs a completion/verification step and orphan sweeps; avoids proxying video through functions.

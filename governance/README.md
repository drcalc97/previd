> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

# PreVid Clinical Safety and Governance Pack (draft)

PreVid is an independent, multi-tenant clinical video assessment platform. Authorised healthcare professionals record short videos (max 3 minutes, 150 MB) during preoperative assessment and review them securely in multidisciplinary team (MDT) meetings. The recordings supplement written clinical information. They do not replace formal preoperative assessment or determine surgical fitness.

## Honest disclaimer

- This pack is a **draft gap analysis and working template set** written by an AI assistant from general knowledge for the owner (a UK doctor, self-funded sole developer).
- It makes **no claim** of certification, compliance, regulatory status, approval, registration or assurance against DCB0129, DCB0160, DTAC, DSPT, Cyber Essentials, ISO 27001, UK GDPR or UK MDR 2002.
- Standards and guidance change. Every reference to a standard is **from general knowledge and must be verified against the current published text** (NHS England, MHRA, ICO, NCSC, IASME, NHS England Digital).
- At the time of writing **nothing is deployed**; the application is under construction. Controls are "designed, implementation in progress" unless stated.
- The MVP uses **synthetic patient data only**. No identifiable NHS patient data may be processed until separate governance, security, contractual and organisational approvals are complete.
- Placeholders such as `<CSO name — TBD>` are deliberate. Do not fill them with invented values.

## Legend (used in every document)

| Tag | Meaning |
|---|---|
| **[Implemented]** | Truly built and verified. Currently essentially nothing carries this tag. |
| **[Planned]** | Designed or intended; implementation in progress or not started. Not evidence. |
| **[Assumption]** | A working assumption that has not been confirmed. |
| **[External review]** | Needs a qualified third party or named role (CSO, DPO, IG lead, lawyer, regulatory consultant, penetration tester, auditor). |
| **[NHS approval]** | Needs approval or sign-off by an adopting NHS organisation before real use. |

## Index

| File | Purpose |
|---|---|
| [01-intended-purpose.md](01-intended-purpose.md) | Intended purpose, users, scope, exclusions, limitations |
| [02-clinical-hazard-log.md](02-clinical-hazard-log.md) | Draft hazard log with risk scale, controls, actions |
| [03-dcb0129-gap-analysis.md](03-dcb0129-gap-analysis.md) | DCB0129 (manufacturer) requirements mapped to status |
| [04-dcb0160-deployment-considerations.md](04-dcb0160-deployment-considerations.md) | Adopting NHS organisation duties and what PreVid must supply |
| [05-dtac-evidence-checklist.md](05-dtac-evidence-checklist.md) | DTAC evidence checklist by section, plus CE/CE+, DSPT, pen test, ISO 27001 |
| [06-dpia-template.md](06-dpia-template.md) | UK GDPR Art 35 DPIA template, pre-populated |
| [07-data-flow.md](07-data-flow.md) | Data flow, Mermaid diagrams, component and location table |
| [08-data-retention-policy-draft.md](08-data-retention-policy-draft.md) | Draft retention and deletion policy |
| [09-information-security-policy-draft.md](09-information-security-policy-draft.md) | Draft information security policy |
| [10-incident-response-plan-draft.md](10-incident-response-plan-draft.md) | Draft incident response plan incl. breach reporting |
| [11-medical-device-classification-questions.md](11-medical-device-classification-questions.md) | Questions for MHRA/UK MDR qualification and classification |
| [12-questions-for-professional-review.md](12-questions-for-professional-review.md) | Consolidated open questions by role |

## Suggested reading order

1. 01 (purpose) then 11 (is it a medical device?). The answer shapes everything else.
2. 02 and 03 (clinical safety), then 04.
3. 06, 07, 08, 09, 10 (data protection and security).
4. 05 (DTAC) as the assembly checklist.
5. 12 as the work list for professional reviewers.

## Document control

| Item | Value |
|---|---|
| Version | 0.1 draft |
| Author | AI-assisted draft for owner — `<owner name — TBD>` |
| Clinical Safety Officer | `<CSO name — TBD>` (none appointed; see 03) |
| Last reviewed by qualified professional | None |

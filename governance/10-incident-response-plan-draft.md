> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 10 — Incident Response Plan (draft) — needs review

**Needs review by IG lead, DPO, CSO and lawyer before use.** **[External review]** Reporting routes and deadlines below are from general knowledge and **must be verified against current ICO, NHS England and DSPT guidance and against each customer contract**. No real patient data is processed in the MVP, but the process should be rehearsed with synthetic scenarios.

## 1. Roles

| Role | Holder |
|---|---|
| Incident lead | `<owner name — TBD>` |
| Clinical safety lead | `<CSO name — TBD>` |
| Data protection contact | `<DPO — TBD>` |
| Customer contacts | Per Trust, recorded in contract `<TBD>` |
| Deputy | `<TBD>` |

## 2. Incident types

| Type | Examples |
|---|---|
| Personal data breach | Unauthorised view/download, cross-tenant exposure, leaked signed URL, lost device with local recording, subprocessor breach |
| Clinical safety incident | Wrong-patient video shown, video missing at MDT, wrong date displayed, defect causing misleading playback |
| Security incident | Credential compromise, vulnerability exploited, malware |
| Availability incident | Outage, failed purge, data loss |

A single event may be several types.

## 3. Process

| Step | Action | Target time |
|---|---|---|
| 1 Detect and log | Record time, reporter, what happened; assign ID; no patient data in the ticket | Immediately |
| 2 Triage | Classify type and severity; start clock on suspected breach awareness | `<TBD>` |
| 3 Contain | Revoke sessions/keys, disable accounts, block routes, rotate secrets, pause purge if relevant, preserve evidence | ASAP |
| 4 Assess | Data affected, tenants, numbers, harm, clinical impact | `<TBD>` |
| 5 Notify (see section 4) | Customers, regulators as required | Per contract and law |
| 6 Eradicate and recover | Fix, restore, verify | |
| 7 Review | Root cause, hazard log update, change actions | Within `<TBD>` days |
| 8 Close | Lessons recorded, CSO sign-off for clinical incidents | |

## 4. Notification routes

| Route | Summary | Notes |
|---|---|---|
| Customer (NHS Trust) | As processor, notify the controller without undue delay of a personal data breach, within the time in the contract `<TBD hours>` | Art 33(2) UK GDPR; contract and DPA define detail **[External review]** |
| ICO | Controller must report notifiable personal data breaches to the ICO **within 72 hours of becoming aware**, unless unlikely to result in a risk to individuals. If PreVid is the controller for any data, PreVid reports | Verify current ICO process and what counts as "aware". Record the decision and rationale even if not reporting |
| Affected individuals | Where high risk to rights and freedoms, controller informs without undue delay | Trust decides |
| DSPT incident reporting | NHS organisations report certain data security and protection incidents via the DSPT incident reporting tool, which can notify ICO and other bodies. Whether PreVid has its own route depends on its DSPT status | Verify current process; PreVid has no DSPT today |
| NHS organisation incident systems | Trust logs via its own system (e.g. LFPSE/Datix for patient safety incidents) | Trust leads; PreVid supports with facts. Verify |
| Clinical safety incident | Notify Trust CSO per contract; manufacturer CSO reviews hazard log | |
| Cyber incidents | Consider NCSC reporting and CareCERT/NHS cyber routes via the Trust `<verify current>` | |
| MHRA | If PreVid is a medical device, serious incidents/Field Safety Notices may be reportable | Depends on 11 outcome |
| Police / Action Fraud | If criminal activity | `<TBD>` |
| Insurers | Notify per policy `<TBD>` | |

## 5. Severity guide (draft)

| Level | Description | Initial response |
|---|---|---|
| 1 Critical | Confirmed unauthorised access to patient video or cross-tenant exposure; clinical harm possible | Immediate containment, notify customers promptly |
| 2 High | Likely breach, wrong-patient display, prolonged outage during MDT hours | Same day |
| 3 Medium | Contained security issue, failed upload class, purge fault | 2 working days |
| 4 Low | Minor defect, no data or clinical effect | Routine |

## 6. Records

Incident log (IDs and facts only, no patient data); breach register including non-notified breaches; post-incident review; link to hazard log IDs.

## 7. Preparation tasks

- Contact list and out-of-hours cover (sole developer risk) `<TBD>`.
- Runbooks: revoke all sessions, rotate keys, disable tenant, purge cached URLs.
- Tabletop exercise with synthetic scenarios and CSO.
- Confirm provider breach-notification commitments (Vercel, Supabase).

## 8. Open questions

| # | Question | Who |
|---|---|---|
| 1 | Contractual notification time to Trusts | Lawyer / Trust |
| 2 | PreVid's own DSPT incident route | IG consultant |
| 3 | Duty to report clinical safety incidents externally | CSO |

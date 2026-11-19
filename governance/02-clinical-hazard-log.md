> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 02 — Clinical Hazard Log (draft)

This is a **starting-point log** drafted by the manufacturer without a hazard workshop. It must be reviewed, challenged and extended at a hazard workshop led by a named CSO. **[External review]** Risk scores are the author's initial judgement and are not validated. All controls are **[Planned]** unless stated; nothing is deployed.

## Risk scale (defined for this log; align with CSO's DCB0129 scheme)

**Likelihood (L)**: 1 Very unlikely · 2 Unlikely · 3 Possible · 4 Likely · 5 Very likely.
**Severity (S)**: 1 Minor (no harm, inconvenience) · 2 Low (minor delay/short-term harm) · 3 Moderate (clinical decision delayed/altered, short-term harm) · 4 Major (serious harm, e.g. inappropriate surgery or cancellation with lasting effect) · 5 Catastrophic (death or permanent severe harm).
**Score = L × S.** Bands: 1–4 Low · 5–9 Medium · 10–14 High · 15–25 Very high.
**Residual** is shown as `L×S=score (band)` **after the planned controls work as designed** and is therefore unverified. Acceptability criteria: `<TBD by CSO>`.

Status key: Open · Controls planned · Needs workshop · Needs NHS-side control (DCB0160).

## Hazard table

| ID | Hazard | Cause | Effect / harm | Existing / designed controls | Residual risk | Status | Owner | Open actions |
|---|---|---|---|---|---|---|---|---|
| H01 | Video associated with wrong patient at recording | Wrong patient selected; similar names; clinician distracted | Wrong video attached to record; later decision based on another person's function | Identity-verification step (name + DOB/NHS number) before record **[Planned]**; patient banner on playback **[Planned]**; audit of who recorded **[Planned]** | 2×5=10 (High) | Needs workshop | Owner / `<CSO name — TBD>` | Design confirm step as hard gate; add post-recording "is this the patient?" review; usability test |
| H02 | Wrong-patient video reviewed at MDT | Wrong patient opened; stale tab; banner overlooked; list ordering | MDT discusses wrong patient's function; wrong plan | Persistent banner with name, DOB/ID, recording date **[Planned]**; one video per view; short-lived URLs **[Planned]** | 2×5=10 (High) | Needs workshop; NHS-side | Owner / Trust | Define MDT use procedure (read out ID); banner contrast and placement test |
| H03 | Stale or mis-dated video relied on after clinical change | Patient condition changed since recording; date not noticed | Fitness impression outdated; unsafe plan | Recording date/time on banner **[Planned]**; age warning threshold TBD **[Planned]** | 3×4=12 (High) | Open | Owner / CSO | Decide staleness threshold and visual warning; Trust policy on validity period |
| H04 | Over-reliance on video as fitness determination (automation/anchoring bias) | Visual impression treated as assessment; reassuring video anchors team | Missed comorbidity; unfit patient listed or fit patient cancelled | Intended-purpose statement and on-screen "supplementary only" notice **[Planned]**; no scoring/AI **[Planned]**; training material **[Planned]** | 3×4=12 (High) | Open | Owner / CSO / Trust | Draft training; consider mandatory acknowledgement; audit of MDT use at Trust |
| H05 | Poor video quality (lighting, framing, audio, low resolution) gives misleading impression | Poor device, lighting, camera angle, patient partly out of frame | Gait or appearance misjudged | Pre-record preview and framing guidance **[Planned]**; playback before save **[Planned]**; re-record option **[Planned]** | 3×3=9 (Medium) | Controls planned | Owner | Quality checklist; minimum resolution check; usability test across devices |
| H06 | Missing/failed upload not noticed (clinician believes recorded) | Network drop, tab closed, storage error, silent failure | MDT expects video that is not there; decision made without it or delay | Explicit upload status with confirmation only after server verifies object **[Planned]**; retry **[Planned]**; patient shows "no video" state clearly **[Planned]** | 3×3=9 (Medium) | Controls planned | Owner | Negative tests for network loss; do not clear local blob until confirmed (balance vs H14) |
| H07 | Duplicate or incomplete uploads | Retry creates duplicates; partial object stored as complete | Wrong/partial clip reviewed; confusion about which is current | Server-side size/duration/integrity check **[Planned]**; status states (pending/complete/failed) **[Planned]**; latest-version indication **[Planned]** | 2×3=6 (Medium) | Controls planned | Owner | Idempotency keys; orphan clean-up job |
| H08 | Unauthorised access incl. cross-tenant and privilege escalation | RLS/app logic bug; misconfigured storage; stolen credentials | Disclosure of special-category video; patient distress; loss of trust; regulatory breach | Mandatory MFA; RLS + app authorisation; private storage; signed URLs; lockout and rate limiting; audit **[Planned]** | 2×5=10 (High) | Controls planned | Owner | Automated cross-tenant tests; independent penetration test **[External review]** |
| H09 | Wrong-organisation access (user sees another Trust's patient/video) | Tenant ID mishandled; user in multiple orgs; admin error | As H08; also wrong-patient confusion | Tenant-scoped queries and RLS; org in every object path **[Planned]**; org-scoped audit **[Planned]** | 2×5=10 (High) | Controls planned | Owner | Multi-org user policy; storage policy tests |
| H10 | Video retained beyond retention period, or deleted early | Purge job failure or misconfiguration; wrong retention days; clock errors | Unlawful retention; or loss of needed video | Per-org retention days; scheduled purge; deletion workflow; purge audit **[Planned]** | 2×3=6 (Medium) | Controls planned | Owner / Trust | Purge monitoring; confirm backups' retention (see 08); change control on retention setting |
| H11 | Recording deleted when needed for a clinical decision | Accidental/early deletion; purge before MDT; admin error | Decision made without video; delay | Deletion requires confirmation and role; soft-delete grace period TBD **[Planned]**; audit **[Planned]** | 2×3=6 (Medium) | Open | Owner / CSO | Decide soft-delete window; warn if upcoming MDT linked |
| H12 | Accessibility failures (screen reader, contrast, keyboard, captions) | Non-accessible UI or player | Reviewer cannot use; error in banner reading | WCAG 2.2 AA target **[Planned]**; accessible banner **[Planned]** | 3×3=9 (Medium) | Controls planned | Owner | Accessibility audit **[External review]**; accessibility statement |
| H13 | Patient did not consent / consent not recorded | Consent step skipped or not documented; capacity unclear | Unlawful processing; harm to trust and dignity | Consent confirmation step **[Planned]** (mechanism TBD); consent audit entry **[Planned]** | 3×4=12 (High) | Open | Trust / DPO / CSO | Define lawful basis and consent model; patient information leaflet **[NHS approval]** |
| H14 | Availability outage at MDT time | Vercel/Supabase outage; browser/codec issue; deployment fault | MDT without video; delay or decision on less information | Logs-only monitoring **[Planned]**; no emergency reliance stated in purpose **[Planned]** | 3×2=6 (Medium) | Open | Owner / Trust | Define availability target and fallback (MDT proceeds without video); status page; no change deploys near MDT hours |
| H15 | Device local persistence of recording | MediaRecorder buffers; browser cache; downloads; OS backup | Patient video remains on clinician device, shared or lost device | Short-lived blobs, revoke URLs and clear memory **[Planned]**; user guidance; managed-device requirement for Trust **[Planned]** | 3×4=12 (High) | Open | Owner / Trust | Cannot guarantee zero persistence. State plainly; Trust device policy **[NHS approval]**; DPIA risk |
| H16 | Time-zone/date display errors | UTC vs local; DST; server vs browser clock | Recording appears more recent/older than it is (feeds H03) | Store UTC; display in Europe/London with explicit zone **[Planned]** | 2×3=6 (Medium) | Controls planned | Owner | Tests around DST changes |
| H17 | Cropped/truncated recordings | 3-min cut-off, 150 MB limit, upload interruption, codec limit | Key movement not seen; partial gait viewed | Visible countdown and limit notice **[Planned]**; duration shown on playback **[Planned]**; truncation flagged **[Planned]** | 3×3=9 (Medium) | Controls planned | Owner | Test limit behaviour on each browser |
| H18 | Incorrect playback speed or codec failure | WebM/MP4 incompatibility; player bug; speed controls misleading | Video won't play or is distorted; gait misjudged | Browser support matrix **[Planned]**; transcoding decision TBD; default 1× speed with clear indicator **[Planned]** | 3×3=9 (Medium) | Open | Owner | Cross-device playback tests; unsupported-browser block page |
| H19 | Patient with capacity/dignity concerns recorded or viewed inappropriately | Recording of a person lacking capacity, or in distress/undress; viewing by too many | Dignity harm; complaint; unlawful processing | Reviewer roles limited; guidance on appropriate recording **[Planned]** | 2×4=8 (Medium) | Open | Trust / CSO | Mental Capacity Act process; exclusion criteria **[NHS approval]**; limit what is recorded |
| H20 | Synthetic/real data confusion | Real patient data entered in MVP; synthetic video mistaken for real or vice versa | Unapproved processing; or clinical decision on fake data | Visible environment/synthetic banner **[Planned]**; separate environments **[Planned]**; no real-data until approvals | 3×4=12 (High) | Open | Owner | Hard gate on go-live; separate projects/keys; "SYNTHETIC" watermark in MVP |
| H21 | Audit trail failure or tampering (supports investigation of other hazards) | Audit write failure; privileged edits | Cannot establish who viewed or recorded | Append-only audit, IDs only **[Planned]** | 2×3=6 (Medium) | Controls planned | Owner | Test write-failure behaviour (fail closed?) |
| H22 | Post-release change introduces defect | Rapid solo development; no review/test | Any of the above | Change control, CI tests **[Planned]** | 3×3=9 (Medium) | Open | Owner | Release procedure; clinical-impact check per change; second reviewer `<TBD>` |
| H23 | User account misuse (shared logins, leavers retained) | Weak joiners/movers/leavers process | Unauthorised access; wrong attribution | MFA; org_admin user management **[Planned]** | 3×4=12 (High) | Open | Owner / Trust | Leavers procedure; periodic access review |

## Notes

- Top residual concerns for the workshop: H01, H02, H03, H04, H13, H15, H20.
- Several controls depend on the adopting Trust (see 04) and cannot be closed by the manufacturer alone.
- Hazards from the hosting/security domain are cross-referenced to 09 and 10.
- Add: sources of new hazards from workshop, user testing, and any real-world use. Never delete closed hazards; mark them closed with reason.

## Review record

| Date | Reviewer | Role | Outcome |
|---|---|---|---|
| `<TBD>` | `<CSO name — TBD>` | CSO | Not yet reviewed |

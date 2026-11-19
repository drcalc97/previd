> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 06 — DPIA Template (UK GDPR Article 35), pre-populated

Blanks are marked `<TBD>`. A real DPIA is owned by the **controller** (the adopting NHS Trust) with its DPO; PreVid supplies input. Check the Trust's own DPIA template and the ICO's current guidance; this layout is a starting point. **[NHS approval] [External review]**

## 1. Document control

| Item | Value |
|---|---|
| Version / date | 0.1 draft / `<TBD>` |
| Controller | `<NHS Trust — TBD>` **[Assumption]** |
| Processor | PreVid, `<legal entity — TBD>` **[Assumption]** |
| DPO review | `<DPO name — TBD>`, `<date>` |
| Status | Draft. **No real patient data processed.** MVP is synthetic-only |

## 2. Need for a DPIA (screening)

Likely required: large-scale or systematic processing is not certain, but special-category health data, video of identifiable individuals, vulnerable data subjects (patients) and new technology are all ICO high-risk indicators. **Treat DPIA as required.** **[External review]**

## 3. Description of processing

| Item | Description |
|---|---|
| Purpose | Supplement written preoperative assessment with a short video showing appearance, mobility and functional status, for MDT review |
| Nature | Collect (record via browser), upload, store, view (signed URL), retain, delete |
| Data subjects | Adult patients attending preoperative assessment `<groups TBD>`; staff users |
| Personal data: patients | Name, DOB and/or NHS number (identity check), video and audio (face, voice, body, home/clinic surroundings), recording date/time, recorder identity `<full field list — TBD>` |
| Personal data: staff | Name, email, role, organisation, MFA data, IP address in security logs `<TBD>`, audit entries (IDs only) |
| Special category | Health data (Art 9). Video may reveal ethnicity, disability, physical condition. Facial images are identifying; treated as biometric-adjacent. Not processed for unique identification, so Art 9 "biometric data" status needs DPO view **[External review]** |
| Volume / frequency | `<TBD>` |
| Retention | Per-organisation, in days, with scheduled purge. Default `<TBD>` (see 08) |
| Recipients | Authorised users in the same organisation only |
| Automated decisions / profiling | None. No AI, scoring or inference |
| Analytics | None |
| Data location | Intended UK (London) — UNVERIFIED (see 07) |

## 4. Roles

| Party | Role | Basis |
|---|---|---|
| NHS Trust | Controller | **[Assumption]** Trust decides purposes and means |
| PreVid | Processor | **[Assumption]** Art 28 contract required. If PreVid chooses its own purposes it would be a controller; avoid |
| Vercel, Supabase, GitHub | Sub-processors | Contracts and DPAs to be reviewed `<TBD>` |

## 5. Lawful basis (placeholders; for the controller to decide)

| Item | Entry |
|---|---|
| Art 6 basis | `<TBD>` Commonly for NHS bodies: public task (6(1)(e)). Not to be assumed |
| Art 9 condition | `<TBD>` Commonly 9(2)(h) health or social care purposes. Not to be assumed |
| DPA 2018 Schedule 1 condition | `<TBD>` |
| Consent role | Separate from UK GDPR lawful basis: common law confidentiality and clinical consent to being filmed. Mechanism `<TBD>` |
| Common law duty of confidentiality | `<TBD>` |
| National data opt-out relevance | `<TBD>`; likely not relevant for direct care, confirm |

## 6. Consultation

| Who | Status |
|---|---|
| DPO / IG lead | `<TBD>` |
| Patient or public representatives | `<TBD>` |
| Clinical users | `<TBD>` |
| Processor and subprocessors | `<TBD>` |
| ICO prior consultation | Only if high residual risk remains `<TBD>` |

## 7. Necessity and proportionality

| Question | Draft answer |
|---|---|
| Is video necessary for the purpose? | `<TBD>` Argument: gives visual information difficult to convey in text. Alternatives (written description, live observation) to be considered |
| Data minimisation | Max 3 min, 150 MB; no AI; IDs only in audit; no analytics **[Planned]** |
| Accuracy | Identity check; date on banner **[Planned]** |
| Storage limitation | Retention days, purge **[Planned]** |
| Transparency | Patient information `<TBD>`; privacy notice by Trust |
| Data subject rights | See section 9 |

## 8. International transfers

| Component | Position |
|---|---|
| Supabase (DB, Storage, Auth) | Intended London region — UNVERIFIED. Support/staff access outside UK: Unknown — verify |
| Vercel (hosting, edge, logs) | Region and edge/CDN processing: Unknown — verify. Possible US processing. Transfer mechanism (UK IDTA/Addendum, UK-US data bridge): `<TBD>` **[External review]** |
| GitHub (code, CI) | No patient data to be stored. Confirm secrets and data are never in repo or CI logs |
| Transfers risk assessment | `<TBD>` |

## 9. Data subject rights

| Right | How supported (Trust decides; PreVid assists) |
|---|---|
| Information | Trust privacy notice; patient leaflet `<TBD>` |
| Access | Export of a patient's videos on Trust request `<Planned? TBD>` |
| Rectification | Video not editable; re-record and delete old `<TBD>` |
| Erasure | Deletion workflow; limited where clinical record retention applies `<TBD>` |
| Restriction / objection | `<TBD>` |
| Portability | Not likely applicable `<TBD>` |
| Automated decisions | None |
| Time to assist controller | `<contract term — TBD>` |

## 10. Security measures

| Measure | Status |
|---|---|
| Mandatory MFA; lockout; rate limiting | **[Planned]** |
| RLS, RBAC, tenant isolation | **[Planned]** |
| Private storage; signed URLs 60–300 s | **[Planned]** |
| Encryption in transit/at rest | **[Assumption]** provider default; verify |
| Append-only audit, IDs only | **[Planned]** |
| Security headers; no analytics; no patient data in logs | **[Planned]** |
| Backups | Unknown — verify; retention interaction with deletion (08) |
| Penetration test; Cyber Essentials; DSPT | Not done |
| Local device persistence | Cannot guarantee zero; Trust device policy **[NHS approval]** |

## 11. Risk register

| ID | Risk to individuals | Source | L | S | Mitigation | Residual | Owner |
|---|---|---|---|---|---|---|---|
| D1 | Unauthorised access to patient video | Auth/RLS bug, theft | `<>` | `<>` | MFA, RLS, signed URLs, pen test **[Planned]** | `<>` | `<>` |
| D2 | Cross-tenant disclosure | Tenant bug | | | Tenant tests, RLS | | |
| D3 | Recording without consent or inappropriate recording (dignity, capacity) | Process failure | | | Consent step, exclusion criteria | | |
| D4 | Wrong-patient association (accuracy) | Human error | | | ID step, banner | | |
| D5 | Over-retention / backups outliving deletion | Config, provider backups | | | Retention, purge, backup policy | | |
| D6 | Transfers outside UK without safeguards | Vercel/support access | | | Verify; contracts; region config | | |
| D7 | Local persistence on devices | Browser behaviour | | | Device policy, guidance | | |
| D8 | Real data in MVP/synthetic confusion | Process | | | Go-live gate | | |
| D9 | Re-identification from video content or filenames | Metadata, filenames | | | Opaque IDs; no names in paths | | |
| D10 | Lack of transparency to patients | No notice | | | Patient information | | |
| D11 | Subprocessor breach | Third party | | | DPAs, monitoring | | |
| D12 | Function creep (e.g. later AI or secondary use) | Product change | | | Purpose limitation; change control | | |

## 12. Sign-off

| Item | Name / date |
|---|---|
| Measures approved by | `<TBD>` |
| Residual risks accepted by | `<TBD>` |
| DPO advice | `<TBD>` |
| ICO consultation needed? | `<TBD>` |
| Review date | `<TBD>` |

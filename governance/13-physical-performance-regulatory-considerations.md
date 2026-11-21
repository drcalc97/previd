> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 13 — Physical Performance Assessment module: regulatory considerations

**This document does not conclude that the module is, or is not, a medical device. It asserts no class, no exemption and no route.** It lists questions and risks for a regulatory consultant with SaMD experience and for the MHRA. The UK medical-device framework (Medical Devices Regulations 2002 as amended, MHRA software and AI as a medical device guidance, and any new or transitional arrangements) has been changing, and everything here is from general knowledge: **every reference must be verified against the current published text.** **[External review]**

Companion documents: `01-intended-purpose.md`, `02-clinical-hazard-log.md`, `03-dcb0129-gap-analysis.md`, `11-medical-device-classification-questions.md` (read first; its questions still apply), `12-questions-for-professional-review.md`, `docs/assessments/CLINICAL_SAFETY.md` (PPA-H01 to PPA-H27).

## 1. Why this module changes the position

`11` was written for a product that stores and displays video, with "no AI or algorithmic interpretation… no scoring" (`01`, section 2). `11` question 5 already asks whether "timers, playback speed, frame-by-frame… annotations" could change the analysis. This module adds all of: timers, frame-by-frame marking, calculated scores (SPPB 0–12, DASI, 6MWT distance, gait speed), a derived physiological estimate (VO2peak from DASI), stored longitudinal results and a trend chart. **Intended purpose is what the manufacturer claims** (labels, website, instructions, marketing), not only what the code does; the claims for this module have not yet been written. The existing statement in `01` is inconsistent with the module and must not be left as is. **[External review]**

Current position of the module: not built for real use; synthetic data only; no regulatory conclusion; no regulatory consultant engaged; no CSO appointed (`03`, gap 2).

## 2. Function-by-function: questions and risks

For each row: what the function does; why it might matter for qualification or classification; the question to put to the consultant/MHRA. No row concludes anything.

| # | Function | Why it might matter | Question for consultant / MHRA | Risk if the assumption is wrong |
|---|---|---|---|---|
| A | Live stopwatch (monotonic clock) | A timer is a simple display tool, but in context its output becomes a clinical measurement | A1. Is a timer that the clinician starts and stops, with no interpretation, in itself relevant to qualification? A2. Does its use within a protocol-specific workflow alter that? | Under-estimating the purpose; "measurement" language in labelling |
| B | Frame-by-frame marking to derive elapsed time | Software helps produce a measurement value from a recording. It is a measurement function | B1. Does a tool that helps a clinician derive a time from video constitute measurement for a medical purpose? B2. Does it matter that the user marks the frames and the software only subtracts? B3. Is stated measurement accuracy a claim that must be substantiated? | A measurement function without validation evidence; claims of accuracy that cannot be supported |
| C | Calculation of clinical scores (SPPB total 0–12; gait speed m/s; 6MWT distance; DASI weighted sum) | Software performing calculation on clinician-entered inputs and presenting a clinically meaningful score | C1. Is a calculator-type function (arithmetic according to a published scoring table) treated differently from a function that interprets? C2. Does the answer depend on the score being intended to inform decisions about diagnosis, monitoring or treatment, and on whether the score carries implicit categories (SPPB bands are not shown in this module)? C3. What evidence is expected that the scoring is correct (verification of the algorithm, not clinical validation)? | Software error becomes a patient-safety risk across all users (PPA-H07); regulatory status unknown |
| D | DASI-derived VO2peak estimate | An estimate of a physiological quantity from a questionnaire is a derived inference, more than a score | D1. Does generating a derived physiological estimate change the analysis compared with showing the DASI total only? D2. Is this function "monitoring" or "prediction" in a regulatory sense? D3. Should it be removed from the first release? D4. What are the licence and provenance issues for the formula and instrument? | A derived value read as a measured fitness value (PPA-H25); regulatory exposure concentrated in this function |
| E | Longitudinal trend display (timeline and chart for comparable protocols) | Showing change over time can be monitoring of a condition or physiological state | E1. Does presenting a series of values and a chart, without thresholds or interpretation, constitute "monitoring" for a medical purpose? E2. Does a comparability rule (software decides which results may be plotted together) amount to a processing step with clinical effect? E3. Do axis scaling, break handling and labelling affect the analysis? | Trend inferred from artefacts (PPA-H09, H23); "monitoring" characterisation unconsidered |
| F | Protocol-specific workflows (guided steps, checklists, deviation capture, stop prompts) | Software guiding the performance of a clinical test goes beyond passive storage | F1. Does guiding a test procedure change the purpose? F2. Is the Stop / safety-prompt behaviour (PPA-H13) a safety-related function needing particular evidence? | Responsibility for patient safety during testing becomes ambiguous |
| G | Amendment/versioning and audit history of timing | Record-keeping; unlikely to be a purpose in itself, but integrity of the measured data matters to safety | G1. What data-integrity expectations apply to a function that stores clinical measurements? | Weak integrity undermines a safety case (PPA-H16) |
| H | Display of results in MDT views | Results presented to colleagues who may weigh them in decisions | H1. Does the likelihood that the result "drives or influences" decisions (`11` Q4) change with a displayed number, as against a video alone? | Underestimated influence (PPA-H11, H12) |
| I | Any **future** thresholds, categories, "normal/abnormal", frailty classes, surgical-fitness or risk output | Interpretation would be a clinical output | I1. At what point does adding any threshold, colour, flag, band or reference range alter the qualification analysis? I2. What re-assessment is required before the first such feature? | Scope drift into a more significant function without re-assessment (core H22) |
| J | Any **future** AI crossing detection, AI repetition counting, automated gait analysis | Algorithmic analysis of video for measurement | J1. What is the expected regulatory treatment of automated measurement derived from video? J2. What clinical and technical evidence would be expected before such a feature is offered? | Same as I; also validation burden |
| K | Export / reports (if built) | Moves results out of the controlled context | K1. Do exports with results and charts change the analysis? K2. What statements must accompany them? | Context stripped (PPA-H23) |
| L | Multi-tenant deployment to NHS Trusts | Product supplied to organisations as a service | L1. Which entity is the manufacturer in the regulatory sense, and does "in-house" use by a single Trust change anything? (do not assume any exemption, `11` Q15) | Wrong assumption about who has duties |

### 2.1 Cross-cutting questions

1. **Intended-purpose drafting.** Which wording describes the module accurately and keeps the claims no wider than what will be evidenced? (A draft addendum is in `CLINICAL_SAFETY.md` section 1, item 10: it is a starting point for the consultant, not an agreed text.)
2. **Does presence of "any software-derived output" change the answer?** `11` Q3 assumed none (score, flag, ranking, alert). This module has scores.
3. **Does the user's ability to override or re-derive every number matter?** (Inputs are always retained; the clinician controls the marks; software only calculates.)
4. **Is a staged approach acceptable?** For example, release 1: display of clinician-recorded times with arithmetic limited to a subtraction; release 2: scores; later: derived estimates. Which stages change the qualification analysis, and can the stages be defined as controlled changes?
5. **Does the existing recorded-video function remain separate?** Can the module be switched off per organisation (a configuration) so that an organisation not wanting it stays within the original purpose? What does that do to the qualification analysis for the product as a whole?
6. **What do other regimes expect?** DTAC and the Trust's procurement may ask about device status (`11` Q13–Q14).

## 3. DCB0129 obligations: what this module triggers

DCB0129 (manufacturer's clinical risk management) is paraphrased in `03`; the paraphrase is not the standard's wording and **must be verified against the current published standard and its guidance.** **[External review]** Whether DCB0129 formally applies, and how it relates to UK MDR if the product is a medical device, is `03` open question 1 and unchanged.

| `03` area | What the module adds | What the owner / CSO must do |
|---|---|---|
| 2 Named CSO | Module adds a new hazard class (measurement, calculation, testing safety). The module should not be released before a competent CSO has reviewed it | Resolve CSO (train or appoint). Consider independent review because the owner is clinician, developer and potential CSO (`03` conflict-of-interest note) |
| 3 Clinical Risk Management Plan | Scope must include the module; acceptability criteria must cover severity-5 test-related harms | CSO to approve scope and criteria; record that the module is within the plan |
| 4 Clinical Risk Management File | New artefacts: scoring specification, protocol versions, timing validation records, hazard log annex | Add to the controlled file with version and sign-off |
| 5 Hazard identification / workshop | `CLINICAL_SAFETY.md` PPA-H01–H27 is a preliminary list written without a workshop | Hold a workshop with a clinician experienced in these tests; update the hazard log; never delete closed hazards |
| 6 Risk analysis and evaluation | Scores are the author's initial judgement | CSO to confirm the scale and scores |
| 7 Risk control and verification | Every software control (S1–S20) needs a test and a recorded result | Build traceability hazard → control → requirement → test; report tests that could not be run |
| 8 Hazard log (live) | Add PPA hazards | Adopt as live with review dates |
| 9 Clinical Safety Case and Report | Safety case must now argue for measurement and derived values | Produce only after controls are verified; not complete until signed by the CSO |
| 10 Intended purpose | Section 2 of `01` is superseded for this module | Update `01` after consultant advice; do not publish module claims before |
| 11 Traceability | New requirements for versioning, immutability, comparability | Link to issues and tests |
| 12 Usability / human factors | Marker editor, deviation capture, amendment notices, chart reading are all safety-relevant | Plan and run usability tests with clinicians (synthetic data); record outcomes |
| 13 Supplier risk | Browser and codec behaviour (video timing) becomes a safety dependency | Add to supplier/dependency assessment; record the supported browser and device matrix |
| 14 Change management | Any change to scoring, protocol text, thresholds or UI wording is a clinical change | Release procedure with a safety-impact field; banned-term check; re-open this document for any interpretation feature |
| 15 Incident handling | Incorrect-result incidents and test-related harm need a route | Extend `10`; define customer notification |
| 16 Post-deployment monitoring | Need a way to hear of wrong results or near-misses | Define a feedback channel; no analytics by design (see `03` row 16) |
| 17 Communication to deploying organisations (DCB0160 inputs) | Trust must be told what the module does and does not do, and what it relies on the Trust for (suitability, safe administration, interpretation) | Add to the safety information pack (`04`) |
| 18 Configuration control | Scoring and protocol versions must be tagged to safety case versions | Tag releases |
| 20/21 Competence / independence | As above | Record competence; consider peer review |

## 4. DCB0160 and adopting-organisation points (supply to Trusts)

**[NHS approval]** The Trust's own clinical safety officer and process (`04`) will need: intended purpose addendum; list of what the app does not do (no interpretation); the dependencies on clinical procedure (suitability, safe testing, training, interpretation, MDT re-check for amendments); validity period policy; local SOP for the protocols; retention/clinical-record status of measurements; the supported browser/device matrix and timing accuracy statement (once evidenced).

## 5. Technical validation and clinical validation are separate evidence streams

| Stream | Question it answers | Examples of evidence (all **not yet existing**) | Who |
|---|---|---|---|
| **Technical validation of video timing** | Does the software derive elapsed time from a video with a known, stated error across supported browsers, devices and frame-rate behaviours (incl. variable frame rate)? | Known-duration reference clips; per-browser frame-accuracy measurements; documented maximum error; negative tests (dropped frames, missing duration metadata); scoring-function verification against independent golden vectors | Owner / technical reviewer; independent review recommended **[External review]** |
| **Clinical validation of the workflow** | Does the video-marked method give results that are fit for the clinical purpose compared with the accepted method (e.g. in-person stopwatch), in the intended users and setting? Do clinicians mark consistently (inter-/intra-rater)? Is the output understood and used safely? | Protocol and study design (outside this repository); comparison with reference method; usability evaluation; user-reported issues | Clinical lead, CSO, regulatory consultant, ethics/governance as applicable **[External review] [NHS approval]** |

A passing technical test does **not** show that the workflow is clinically valid, and clinical acceptance of the stopwatch method does **not** show that video-derived timing is equivalent. Neither stream is evidence of compliance. Claims such as "validated", "accurate" or "equivalent to a stopwatch" must not appear in product text, documentation or marketing until supported.

## 6. Risks to record (regulatory)

| # | Risk | Note |
|---|---|---|
| R1 | Building scoring and derived estimates before the qualification question is answered | Rework or withdrawal risk; possible unlawful supply if the product is a device and has not met obligations. Mitigation: seek advice before building beyond the display of clinician-marked times; keep the module off by configuration |
| R2 | Intended-purpose drift via UI wording, thresholds, colours, charts | Controlled by change gate and banned-term check (`CLINICAL_SAFETY.md` S14) |
| R3 | Claims of accuracy without evidence | See section 5 |
| R4 | Licence/provenance of instruments and formulae (DASI, SPPB, 6MWT materials) | Not a regulatory conclusion; a legal issue to resolve (PPA-H21) |
| R5 | Evidence burden from the first interpretation or AI feature | Re-run the whole assessment |
| R6 | Sole-developer capacity for the evidence a measurement function needs | Resourcing and independence (`03` rows 1, 21) |
| R7 | Trust procurement may require a device-status statement | `11` Q13–Q14; `05` |

## 7. What the owner and the CSO must do (summary)

1. Engage a regulatory consultant with SaMD experience and put sections 2 and 5 to them; consider an MHRA enquiry. **[External review]**
2. Decide, with advice, whether to build the VO2peak estimate and trend chart in the first release.
3. Appoint or train the CSO; hold the workshop; keep the intended-purpose addendum under change control.
4. Record the reasoning in the Clinical Risk Management File even when advice is pending (`11`, section 5).
5. Do not describe the module, in any text, as validated, accurate, compliant, certified, registered or exempt.

## 8. Outstanding assurance requirements (checklist)

None of these items is complete. Tick only with evidence held in the Clinical Risk Management File.

| # | Requirement | Status | Tag |
|---|---|---|---|
| 1 | Regulatory consultant engaged; written qualification decision and rationale for the module (device / not, class and route if device) | Not started | **[External review]** |
| 2 | MHRA enquiry made (if advised); response retained | Not started | **[External review]** |
| 3 | Intended-purpose addendum agreed and `01` updated | Draft text only | **[External review]** |
| 4 | Named CSO with training and competence record | Not met | **[External review]** |
| 5 | Clinical Risk Management Plan covering the module | Not started | **[External review]** |
| 6 | Hazard workshop held; PPA hazard log reviewed and merged with `02` | Not started | **[External review]** |
| 7 | Protocol specifications verified against primary sources by a clinician | Not started | **[External review]** |
| 8 | Scoring specification and golden vectors independently verified | Not started | **[External review]** |
| 9 | Instrument licensing and permitted-use confirmation (DASI, SPPB, 6MWT materials, formulae) | Not started | **[External review]** |
| 10 | Technical validation of video timing: protocol, reference clips, supported browser/device matrix, stated maximum error | Not started | **[External review]** |
| 11 | Clinical validation plan for the video-marked workflow (inter-/intra-rater; comparison to reference method), ethics/governance route if required | Not started | **[External review] [NHS approval]** |
| 12 | Usability/human-factors evaluation (synthetic data) | Not started | **[External review]** |
| 13 | Traceability matrix hazard → control → requirement → test with results | Not started | — |
| 14 | Independent security review of assessment, versioning, audit and scrub code paths (see `docs/assessments/SECURITY_REVIEW_PLAN.md`) | Not started | **[External review]** |
| 15 | Tamper-evident audit implemented and verified (gap: `SECURITY_REQUIREMENTS` row 18, SEC-017) | Gap | **[Planned]** |
| 16 | DPIA updated for derived data, retention and consent withdrawal (`06`, `08`) | Not started | **[External review]** |
| 17 | Clinical Safety Case and Report (not until controls are verified) | Not possible yet | **[External review]** |
| 18 | DCB0160 information pack for adopting Trusts covering module dependencies | Not started | **[NHS approval]** |
| 19 | Change-control gate: any threshold, category, AI feature, or new derived estimate re-opens qualification | Planned | **[Planned]** |
| 20 | Post-deployment monitoring and incident route for wrong results/harm during testing | Not started | **[Planned]** |
| 21 | Decision on retention and clinical-record status of measurements | Open | **[NHS approval]** |
| 22 | Go-live gate agreed: no real patient data until items above resolved | Not set | **[NHS approval]** |

## 9. Output expected (placeholders; do not fill without evidence)

| Item | Value |
|---|---|
| Qualification decision for the module | `<TBD — by regulatory consultant>` |
| Classification and route (if device) | `<TBD>` |
| Written rationale retained in the file | `<TBD>` |
| Date and reviewer | `<TBD>` |

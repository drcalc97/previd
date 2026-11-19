> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 11 — Medical Device Classification Questions

**This document does not conclude that PreVid is, or is not, a medical device, and asserts no exemption or class.** The UK medical device framework (Medical Devices Regulations 2002 as amended, MHRA guidance on software including Software as a Medical Device (SaMD)) has been changing, and the current rules, guidance and any transition arrangements **must be verified with the MHRA and a regulatory consultant**. **[External review]**

## 1. Why the question matters

If software has a medical purpose as defined in the regulations, it may need conformity assessment, UKCA (or recognised CE) marking, MHRA registration, vigilance and post-market surveillance. A medical device also changes the DCB0129 and DTAC position. A wrong assumption either way carries legal and patient-safety risk.

## 2. Questions on intended purpose

| # | Question |
|---|---|
| 1 | Does the manufacturer's intended purpose (labelling, website, instructions, marketing) state or imply diagnosis, monitoring, prognosis, prediction or treatment of disease or fitness for surgery? Note: intended purpose is what the manufacturer claims, not only what the code does. |
| 2 | Is the software merely storing, transmitting and displaying video (communication/storage), or does it process the data for a medical purpose? |
| 3 | Is a human clinician always the interpreter, with no software-derived output (score, flag, ranking, alert)? **[Assumption]**: yes, no AI. |
| 4 | Does the video "drive or influence" clinical decisions (e.g. listing, anaesthetic planning, cancellation)? If so, how significantly? Does the answer change with how the MDT uses it? |
| 5 | Any features that could be seen as measurement (e.g. timers, playback speed, frame-by-frame, zoom, annotations)? Each could change the analysis. |
| 6 | Any future features (AI frailty, gait analysis, quality checks that accept/reject recordings) that would clearly alter status? Plan for change control to prevent drift. |

## 3. Questions on classification reasoning (if it is a device)

| # | Question |
|---|---|
| 7 | Under the current UK rules, which classification rule would apply to software providing information used to take decisions with diagnosis or therapeutic purposes (an EU MDR Rule 11-type analysis, if the UK retains or adopts equivalent reasoning)? Verify what the applicable UK rule set is now. |
| 8 | Severity of potential harm from a wrong decision informed by the software (EU-style reasoning scales class by harm; verify UK position). |
| 9 | Which conformity assessment route and approved body, if any, would apply? |
| 10 | Which standards would be expected (e.g. IEC 62304, ISO 14971, IEC 62366, ISO 13485) and do they overlap with DCB0129 evidence? Verify. |
| 11 | MHRA registration, UKCA/CE marking status, UK Responsible Person if relevant to the manufacturer's location. |
| 12 | Vigilance and post-market surveillance duties and how they link to 10. |

## 4. Questions on other regimes

| # | Question |
|---|---|
| 13 | Does the device status alter DTAC section B answers? |
| 14 | Does device status alter adoption by Trusts and procurement frameworks? |
| 15 | Do any exemptions (e.g. for in-house or non-medical software) apply? **Do not assume.** |

## 5. Recommendation

1. Seek **MHRA guidance** (MHRA's software and AI as a medical device guidance and its enquiry route) and a **regulatory consultant** with SaMD experience before real-world use or any marketing to the NHS. **[External review]**
2. Until advice is received, keep the intended purpose narrow, avoid claims of diagnosis or fitness, add no analytic features, and record the reasoning in the Clinical Risk Management File.
3. Re-run this assessment at each material change.

## 6. Output expected

| Item | Value |
|---|---|
| Qualification decision (device / not) | `<TBD — by regulatory consultant>` |
| Classification and route (if device) | `<TBD>` |
| Written rationale retained in the file | `<TBD>` |
| Date and reviewer | `<TBD>` |

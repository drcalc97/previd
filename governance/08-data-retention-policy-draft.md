> **DRAFT — not reviewed by a qualified professional. Not evidence of compliance.**

Legend: **[Implemented]** built and verified · **[Planned]** designed/in progress · **[Assumption]** unconfirmed · **[External review]** needs qualified third party · **[NHS approval]** needs NHS organisation sign-off.

# 08 — Data Retention Policy (draft)

## 1. Principles

- The adopting Trust (controller **[Assumption]**) decides retention; PreVid enforces the configured setting.
- Keep video no longer than needed for its purpose (supplementing preoperative assessment and MDT review).
- Whether the video forms part of the health record, and so falls under the Records Management Code of Practice schedules, is **undecided** and must be settled by the Trust. **[NHS approval] [External review]** Verify against the current NHS England Records Management Code of Practice.
- MVP: synthetic data only; same mechanics apply for testing.

## 2. Settings (designed) **[Planned]**

| Setting | Detail |
|---|---|
| Retention period | Per organisation, in days. Default: `<TBD — no default assumed>`. Set by org_admin; changes audited |
| Minimum / maximum bounds | `<TBD>` |
| Purge | Scheduled job deletes expired videos (storage objects) and related metadata |
| Deletion workflow | Authorised deletion request, confirmation, audit entry, removal from storage and DB |
| Soft-delete grace | `<TBD>` (see hazards H10, H11) |
| Legal hold / pause purge | `<TBD>` |

## 3. Data types

| Data | Retention | Notes |
|---|---|---|
| Patient video | Org retention days | Primary data |
| Patient record (name, DOB/NHS no.) | `<TBD>` Linked to video or longer? | Minimise |
| Audit log (IDs only) | `<TBD>` Longer than video probably, to evidence access | Contains no video or names; verify IDs cannot re-identify without the DB |
| User accounts | While employed/authorised; delete or anonymise on leaving `<TBD>` | |
| Application and platform logs | Provider defaults: unknown — verify; target short | No patient data |
| Backups | Unknown — verify | Deleted videos may persist in backups until they expire. State this honestly to customers |
| Tenant exit | Return or delete all data within `<TBD>` days of contract end; certificate of deletion `<TBD>` | Contract |

## 4. Deletion rules

1. Deletion removes the storage object and DB metadata; verify storage deletion succeeded before marking complete.
2. Failed purge raises an alert (logs-only monitoring) and is retried.
3. Deleted data in provider backups expires on the provider schedule; document it. Restores must re-apply deletions `<Planned: tombstone list — TBD>`.
4. Early deletion by clinician requires confirmation and is audited.
5. Local copies on devices are outside PreVid's control (H15).

## 5. Open questions

| # | Question | Who |
|---|---|---|
| 1 | Is the video part of the clinical record and what retention applies? | Trust IG / records manager |
| 2 | Appropriate default and maximum retention | CSO / IG lead |
| 3 | Audit-log retention period | DPO |
| 4 | Backup retention vs right to erasure approach | DPO / lawyer |
| 5 | Subject access: must PreVid retain video until a request is answered? | DPO |

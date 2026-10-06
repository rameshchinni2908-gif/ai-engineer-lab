---
doc-status: CURRENT
effective-date: 2026-02-01
supersedes: nimbus-pricing-2024-01-ARCHIVED.md
---

# Nimbus Cloud Storage — Pricing (effective 2026-02-01)

This is the current, authoritative pricing document for Nimbus Cloud Storage. If any other
document in this corpus states a different price or quota, **this document wins** — it has the
most recent effective date. A document literally named `*-ARCHIVED.md` exists in this corpus on
purpose, to give the RAG failure-mode lab a realistic "stale document" scenario to detect and
diagnose; it should never be treated as current.

## Plans

| Plan | Price | Storage quota | Workspace members | Support |
|---|---|---|---|---|
| Free | $0 / month | 15 GB total | up to 3 | community forum only |
| Pro | $12 / user / month | 500 GB pooled | up to 50 | email, 1 business day response |
| Business | $27 / user / month | 2 TB pooled, +$0.02/GB over quota | unlimited | email + chat, 4 hour response |

Annual billing gets a 15% discount on Pro and Business (so Pro is effectively $10.20/user/month
billed annually). There is no annual discount on Free, because Free is already $0.

## What counts against the storage quota

File content counts against quota once, regardless of how many links or shares point to it.
Version history (see `nimbus-data-retention-policy.md`) is kept for 30 days by default and DOES
count against quota while retained. Deleted files in the trash also count against quota until
the trash retention period (30 days) expires.

## Overage behavior

- **Free and Pro**: uploads are rejected once the quota is exceeded; no automatic overage
  billing. The workspace admin sees a blocking banner and must upgrade or delete data.
- **Business**: uploads continue past quota and are billed at $0.02/GB/month for the overage,
  invoiced monthly. There is no hard upload block on Business.

## Changing plans

Upgrades take effect immediately and are prorated for the current billing period. Downgrades
take effect at the start of the next billing period, and will be blocked if the workspace is
currently using more storage or has more members than the target plan allows.

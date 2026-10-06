# Nimbus Cloud Storage — Security & Compliance

## Encryption

All data in transit between sync clients, browsers, and the Nimbus API uses TLS 1.2 or higher.
Data at rest in the object store is encrypted using AES-256, with per-workspace encryption keys
managed by Nimbus's key management service. Business-plan workspaces may bring their own
encryption key (BYOK) via an integration with a third-party KMS; Free and Pro plans use
Nimbus-managed keys only.

## Authentication

Nimbus supports email/password login with mandatory TOTP-based two-factor authentication for
any account with the `admin` role. Business-plan workspaces can additionally enable SSO via
SAML 2.0 or OIDC, and can enforce SSO-only login for all members (disabling email/password
login workspace-wide).

## Compliance posture

Nimbus maintains a SOC 2 Type II report, renewed annually, covering the security, availability,
and confidentiality trust service criteria. Nimbus does **not** currently maintain a HIPAA
Business Associate Agreement program or a FedRAMP authorization — teams with those specific
regulatory requirements should not use Nimbus for in-scope data. GDPR: Nimbus acts as a data
processor for workspace content and offers a Data Processing Addendum on request for any plan.

## Data residency

By default, workspace data is stored in the region closest to the workspace's billing address
at creation time, chosen from three regions: US (us-east), EU (eu-west), and APAC
(ap-southeast). Business-plan workspaces can pin their region explicitly at creation and request
a one-time migration to a different region (a manual, scheduled operation, not self-service).

## Access logging and audit

Every file access, share-link creation, permission change, and admin action is written to an
append-only audit log. Audit log entries are retained for 7 years regardless of plan — this is
longer than any other retention period in the product (compare with
`nimbus-data-retention-policy.md`'s 30-day trash/version retention) because audit logs exist for
compliance review, not operational recovery, and are deliberately kept much longer.

## Incident response

Nimbus commits to notifying affected workspace admins of a confirmed data breach within 72
hours of confirmation, consistent with GDPR's notification expectations. Security researchers
can report vulnerabilities to a published disclosure address; Nimbus does not operate a public
bug-bounty program at this time.

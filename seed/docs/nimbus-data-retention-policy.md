# Nimbus Cloud Storage — Data Retention Policy

This document covers what happens to data over time: trash, version history, account closure,
and audit logs. Numbers here are specific on purpose — they're good targets for exact-match and
"needle in a haystack" retrieval tests, including when this document is placed in the middle of
a long context window alongside less relevant material (see the RAG module's "lost-in-the-middle"
failure-mode demo).

## Deleted files ("trash")

When a member deletes a file or folder, it moves to a per-vault trash and is **retained for 30
days** before permanent, unrecoverable deletion. Any workspace admin can restore a trashed item
during that window. After 30 days, a background job permanently purges it; this purge cannot be
undone, even by Nimbus support.

## Version history

Every file keeps prior versions for **30 days** from when each version was superseded, after
which older versions are pruned (the current version is never pruned by this policy). Business
plan workspaces may extend version history retention to 1 year via a workspace setting; Free and
Pro plans cannot change this setting.

## Account and workspace closure

If a workspace's billing fails and is not resolved within 14 days, the workspace is suspended
(read-only: members can export but not modify or add data). A suspended workspace is retained
for 90 days total before all content is permanently deleted. Exporting a full workspace archive
during the read-only window produces a single zip file per vault, generated asynchronously and
emailed to the billing owner as a download link valid for 7 days.

## Audit logs

As stated in `nimbus-security-compliance.md`, audit log entries are retained for **7 years**,
independent of the much shorter trash/version-history windows above and independent of workspace
closure — closing a workspace does not delete its historical audit log.

## Legal holds

A workspace admin (or Nimbus support, on receipt of a valid legal order) can place a legal hold
on a vault, which suspends all of the above deletion/pruning behavior for that vault until the
hold is lifted — trashed files stop aging out, and version pruning pauses, for the duration of
the hold.

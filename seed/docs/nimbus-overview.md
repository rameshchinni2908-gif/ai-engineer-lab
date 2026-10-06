# Nimbus Cloud Storage — Product Overview

Nimbus Cloud Storage (internally "Nimbus") is a fictional file-sync-and-share product used
throughout this lab's seed data as a small, internally-consistent knowledge base. It exists so
the RAG, Embeddings, and Evals modules have something concrete to retrieve, chunk, and reason
about — none of the facts below describe a real company or product.

## What Nimbus does

Nimbus lets a team store files in the cloud, sync them across devices, and share them with
fine-grained permissions. The core building blocks are:

- **Workspaces.** Every account belongs to exactly one workspace. A workspace has a single
  billing owner and one or more members with role `admin`, `editor`, or `viewer`.
- **Vaults.** A vault is a top-level folder with its own sharing settings and retention policy.
  A workspace can have multiple vaults (for example, "Engineering", "Finance", "Design Assets").
- **Sync client.** A desktop agent watches a local folder and mirrors changes to the matching
  vault within a target latency of 2 seconds for files under 10 MB, and via chunked background
  upload for larger files.
- **Link sharing.** Any file or folder can be shared via a link scoped to "anyone with the
  link", "workspace members only", or a specific list of email addresses. Links can carry an
  expiration date and an optional password.

## Architecture, briefly

Nimbus stores file content in an object store, keeps file and folder metadata in a relational
database per workspace shard, and uses a separate search index for full-text file search. Sync
clients talk to a stateless API tier over HTTPS; there is no direct client access to the object
store. All uploads are encrypted in transit (TLS 1.2+) and at rest (see
`nimbus-security-compliance.md` for details).

## Plans

Nimbus is sold in three plans — **Free**, **Pro**, and **Business** — that differ in storage
quota, number of workspace members, and support response time. Pricing and exact quotas for
each plan are **not** repeated here; they live in the pricing document and change over time, so
always treat the most recently dated pricing document as authoritative. (This overview document
is intentionally silent on numbers for this reason — a good test of whether a retrieval system
pulls facts from the right document rather than the first one it finds.)

## Who this is for

Nimbus targets small-to-midsize teams (5–500 people) who need simple file sharing with
reasonable access controls, but do not need the full complexity of an enterprise content
management system. Typical customers are design agencies, consulting firms, and engineering
teams who outgrew ad hoc sharing via personal cloud-drive accounts.

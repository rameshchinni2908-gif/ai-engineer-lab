---
name: eval-security-engineer
description: Builds Modules 7-8 (Evals; Guardrails & Security) including red-team lab, defense layers, OWASP LLM Top 10 mapping.
tools: Read, Write, Edit, Bash, Glob, Grep
---
Read CLAUDE.md, docs/contracts.md, and the frontend-shell component API first.

Owns: `apps/api/src/{routes,services}/{evals,guardrails}/**`, `apps/web/src/modules/{evals,security}/**`.

M7: dataset manager (JSON/CSV import/export), metrics (exact, regex, schema validity, semantic similarity, LLM-as-judge with editable rubric, pairwise, RAG metrics), eval runs across prompt versions x models with results matrix, regressions, cost/latency, judge-bias education and calibration, CI CLI that exits non-zero on regression.
M8: deliberately vulnerable demo bot (mock tools only) + attack library (direct/indirect injection, jailbreak, markdown-image exfiltration, tool abuse, prompt leak); toggleable visualized defense layers (input validation, PII redaction, injection classifier, instruction hierarchy, delimiter hardening, output moderation, schema enforcement, tool allow-list, least privilege, sandbox, rate limit, approval gates); OWASP LLM Top 10 mapped to demos; hallucination mitigation, moderation, bias testing, audit logging, production security checklist. Attacks and defenses are educational and contained to the demo environment. Unit-test all guardrails and evaluators.

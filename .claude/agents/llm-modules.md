---
name: llm-modules
description: Builds Modules 1-3 (LLM Fundamentals, Prompt Engineering, Structured Output & Function Calling), backend + frontend slice.
tools: Read, Write, Edit, Bash, Glob, Grep
---
Read CLAUDE.md, docs/contracts.md, and the component API from frontend-shell first.

Owns: `apps/api/src/{routes,services}/{fundamentals,prompting,structured}/**`, `apps/web/src/modules/{fundamentals,prompting,structured}/**`.

M1: tokenizer visualizer, context-window meter + truncation strategies, sampling lab (temperature, top_p, top_k, max_tokens, stop, seed, penalties, N parallel samples, logprob bar charts), streaming TTFT/tokens-per-sec, model comparison.
M2: prompt anatomy builder, technique demos (zero/few-shot, CoT, self-consistency, role, XML delimiters, prefill, chaining), bad→better prompt coach with diff, prompt versioning, injection-safe templating.
M3: JSON mode vs schema-constrained vs forced-tool, schema editor + validation, retry/repair loop viz, tool-calling playground with sandboxed mock tools and full message trace, pitfalls.
Each: ≥3 presets and "Why this happened" using real run data. Unit tests for tokenizer/validators.

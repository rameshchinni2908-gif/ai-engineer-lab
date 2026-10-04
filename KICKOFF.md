# KICKOFF PROMPT: paste into Claude Code after setup

You are the ORCHESTRATOR for building AI Engineer Lab. Read CLAUDE.md fully, then follow its
"Multi-agent orchestration protocol" exactly. Build the ENTIRE app in one autonomous run.

Rules for this run:
1. First create `docs/PROGRESS.md` with every wave and every module as a checklist. Update it after each step. If context is compacted or you restart, read it first and resume.
2. Execute Wave 0 → 1 → 2 → 3 from CLAUDE.md. Inside a wave, launch all agents in PARALLEL (several subagent calls in ONE message). Never start a wave before the previous gate passes.
3. When delegating, give each subagent a self-contained brief: its module list, owned paths, the contract sections it must follow, and its definition of done. Tell it to return a short summary, not code dumps.
4. After each wave: run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Run the `reviewer` agent. Send BLOCKER/MAJOR findings back to the owning agent. Re-run the gate until green. Then `git commit` ("feat(wave-N): ...").
5. Do not skip scope to save time. If something is too large, split it into sub-tasks across more subagent calls instead of simplifying the feature.
6. If a contract change is needed, update docs/contracts.md first and re-brief affected agents.
7. Finish with: working `pnpm dev` and `docker compose up` in Mock mode, README quickstart, seed data, and a final acceptance check against CLAUDE.md's Acceptance criteria. Report what passes and what is still missing, honestly.

Begin now with Wave 0: initialize git, create docs/PROGRESS.md, delegate to `architect`.

---
name: agent-engineer
description: Builds Module 6 (AI Agents): runtimes, tools, memory, trace viewer, controls, graph view, MCP section.
tools: Read, Write, Edit, Bash, Glob, Grep
---
Read CLAUDE.md, docs/contracts.md, and the frontend-shell component API first.

Owns: `apps/api/src/{routes,services}/agents/**`, `apps/web/src/modules/agents/**`.

Build: agent runtime with ReAct, plan-and-execute, reflection, supervisor+worker; tools (calculator, web-search mock, vector search, isolated code sandbox, file reader, allow-listed HTTP fetcher); memory (short-term, vector long-term, summary) each inspectable; controls (max steps, budget cap, timeout, loop detection, human-in-the-loop approval); live trace timeline/graph with tokens+cost per step; state-machine view; MCP client section exposing server tools to the agent; pitfalls and "when NOT to use an agent". Sandbox must have no host access. Test loop detection, budget caps, and sandbox isolation.

import type { ModuleContent } from "../types";

export const agentsContent: ModuleContent = {
  moduleId: "agents",
  learn: {
    moduleId: "agents",
    summary: {
      beginner:
        "An agent is a model that can take actions — calling tools, searching, running code — in a loop, observing results and deciding what to do next, instead of just answering in one shot.",
      intermediate:
        "The agent loop needs explicit guardrails — max steps, budget, timeout, loop detection, human-in-the-loop approval for dangerous tools — because nothing about the loop itself guarantees it converges or stays within sane cost. MCP standardizes how tools are discovered and called across different agent frameworks.",
      senior:
        "An agent's real security boundary is its tool registry and allow-list, not its system prompt. Every one of the five tunable limits (maxSteps, budgetUsd, timeoutMs, loopDetection, requireApprovalForDangerousTools) exists because a specific, observed failure mode needed a structural stop condition — treat all five as mandatory production configuration, not optional tuning.",
    },
    explain: [
      {
        heading: "The agent loop: observe, decide, act, repeat",
        body: "At each step, the agent receives everything accumulated so far (including prior tool results) and either calls another tool or produces a final answer. This app's `/agents/run` emits an `agent_step` event per iteration and terminates via an explicit `stopReason` — `final`, `max_steps`, `budget`, `timeout`, `loop_detected`, `error`, or `awaiting_approval` — so you always know exactly why a run ended, not just that it did.",
      },
      {
        heading: "Human-in-the-loop pauses the stream, it doesn't fake-continue",
        body: "When a step needs approval for a dangerous tool, the SSE stream genuinely pauses — no further `agent_step`/`token` events — until `/agents/:id/approve` is called, then resumes on the same connection. If no approval arrives within the timeout, the agent fails safely with `stopReason: 'timeout'` rather than hanging forever.",
      },
      {
        heading: "MCP lets an agent use tools it was never specifically coded against",
        body: "Rather than hardcoding every tool definition into the agent, MCP servers expose tools dynamically — `/mcp/servers/:id/tools` lists what's available, and the agent can call them the same way it calls its built-in registry tools. This decoupling is powerful, but it means an MCP server's trustworthiness needs the same scrutiny as any other tool source.",
      },
    ],
    underTheHood: [
      {
        heading: "Loop detection compares recent steps for near-identical repetition",
        body: "`LoopDetectionConfig` defines a sliding window and a similarity threshold — if the agent's recent tool calls and results are near-identical across that window, it's treated as stuck and the run terminates with `stopReason: 'loop_detected'`, distinct from simply running out of `max_steps` on healthy-looking progress.",
      },
      {
        heading: "Memory inspection surfaces all three memory types explicitly",
        body: "`/agents/:id/memory` returns `shortTerm` (this run's in-context scratchpad), `longTerm` (vector-store hits, empty if the runtime doesn't use vector memory), and a `summary` — making the otherwise-invisible distinction between what's currently in context versus what's been persisted across runs directly inspectable.",
      },
      {
        heading: "Nested LLM calls inside a step are still full, separately-persisted Runs",
        body: "A single agent step that calls an LLM creates its own `Run`, visible via `GET /runs?traceId=`, linked back to the parent agent run. This is what lets the Run Inspector show the complete cost/latency breakdown of a multi-step agent execution, not just one aggregated number.",
      },
    ],
    seniorGotchas: [
      {
        heading: "The tool registry is the real security boundary, not the system prompt",
        body: "An agent cannot call a tool that isn't in its allow-list for that run, regardless of what the model 'wants' to do — this is enforced structurally, not by politely asking the model not to misuse dangerous tools. Prompt-level warnings about tool misuse are a weak second layer at best; the registry/allow-list is the actual control.",
      },
      {
        heading: "max_steps alone doesn't catch an agent that's stuck, only one that's slow",
        body: "An agent can spend its entire step budget repeating a failed approach without technically looping on identical actions in a way a naive detector catches, or it can loop in a way that looks like 'progress' step-to-step. Loop detection and max_steps are complementary, not redundant — one catches pathological non-progress early and cheaply, the other bounds worst-case cost regardless of whether progress looks healthy.",
      },
      {
        heading: "A HITL gate that times out or gets rubber-stamped provides much weaker protection than it looks like",
        body: "Human-in-the-loop only works as a real safeguard if approvals are genuinely reviewed, not routinely auto-approved under time pressure or because the UI makes approval the path of least resistance. Measure how often approvals are actually scrutinized versus rubber-stamped before trusting the control.",
      },
      {
        heading: "Long-term memory can accumulate and re-serve its own past mistakes",
        body: "A wrong conclusion stored in vector memory during an earlier run gets retrieved and trusted in later runs just like any other memory, with no inherent mechanism to flag it as previously wrong — memory systems need an explicit way to correct, decay, or invalidate stored entries, or errors compound across runs silently.",
      },
    ],
  },
  pitfalls: [
    {
      id: "agents-unbounded-loop",
      title: "An agent burns through its entire step/budget limit without finishing",
      symptom: "A run consistently terminates with stopReason: 'max_steps' or 'budget' instead of 'final', even on tasks that should be solvable.",
      cause: "The agent kept retrying a failing approach (e.g. malformed tool arguments it never corrected) without making real progress, and no loop detection was configured to catch the repetition earlier.",
      fix: "Enable loop detection with a sensible similarity threshold and window size, and inspect the step trace to see whether the agent is genuinely stuck versus just needing a higher step budget for a legitimately multi-step task.",
      severity: "high",
    },
    {
      id: "agents-dangerous-tool-no-approval",
      title: "A dangerous tool executes without any human review",
      symptom: "A code-execution or file-access tool call runs automatically even though it should have required approval.",
      cause: "`requireApprovalForDangerousTools` wasn't enabled, or the specific tool wasn't included in `approvalRequiredTools`, so the registry didn't flag it as needing a pause.",
      fix: "Explicitly configure which tools require approval (don't rely on a tool's own `dangerous: true` flag alone to gate it) and verify with a test run that the stream actually pauses at that step.",
      severity: "high",
    },
    {
      id: "agents-rubber-stamped-approval",
      title: "Human-in-the-loop approvals are consistently granted without real review",
      symptom: "Every approval request gets approved within seconds, including ones that, on closer inspection, shouldn't have been.",
      cause: "The approval UI made 'approve' the fastest, lowest-friction action, and reviewers weren't given enough context (what the tool does, what arguments it was called with) to meaningfully evaluate the request.",
      fix: "Surface the full tool call (name, arguments, and why it's flagged dangerous) prominently in the approval prompt, and treat a near-100% approval rate as a signal to audit whether review is actually happening.",
      severity: "medium",
    },
    {
      id: "agents-stale-long-term-memory",
      title: "An agent confidently repeats a conclusion from an earlier run that was actually wrong",
      symptom: "The agent cites a 'fact' from its own memory that doesn't match current reality or was never actually verified.",
      cause: "Long-term (vector) memory stored an earlier run's conclusion without any mechanism to mark it as unverified or later invalidate it, so it gets retrieved and trusted indefinitely in later runs.",
      fix: "Add explicit provenance/confidence metadata to stored memories, and build a decay or correction mechanism rather than treating every stored memory as permanently authoritative.",
      severity: "medium",
    },
    {
      id: "agents-mcp-trust-assumption",
      title: "An MCP server's tool is trusted the same as a built-in tool with no extra scrutiny",
      symptom: "A tool discovered via an MCP server performs an action with broader scope or different side effects than its description suggested.",
      cause: "The agent's tool registry treated MCP-discovered tools identically to vetted built-in tools, without applying the same allow-listing/sandboxing review to an externally-sourced tool definition.",
      fix: "Apply the same least-privilege review to any MCP server's tools before adding them to an agent's allow-list — treat an external tool source as untrusted until reviewed, the same as any other third-party dependency.",
      severity: "medium",
    },
  ],
  quiz: [
    {
      id: "agents-q1",
      question: "What is the real enforcement mechanism that prevents an agent from using a tool it shouldn't have access to?",
      options: [
        "A system prompt instruction telling the model not to use that tool",
        "The tool registry/allow-list for that run — the agent structurally cannot call a tool that isn't in its permitted set",
        "The model's own judgment about what's appropriate",
        "A warning message shown to the user after the fact",
      ],
      correctIndex: 1,
      explanation: "Prompt instructions are a soft, probabilistic nudge at best. The tool registry/allow-list is a structural control — if a tool isn't in the list passed for that run, the agent literally has no way to call it, regardless of what the model generates.",
      difficulty: "senior",
    },
    {
      id: "agents-q2",
      question: "An agent run terminates with stopReason: 'loop_detected' rather than 'max_steps'. What does this distinction tell you?",
      options: [
        "Nothing — the two stop reasons are functionally identical",
        "The agent was caught repeating near-identical actions/results within a sliding window, which is a different (and earlier, cheaper) catch than simply running out of its total step allowance",
        "loop_detected only fires when max_steps is set to zero",
        "loop_detected means the request had invalid JSON",
      ],
      correctIndex: 1,
      explanation: "Loop detection specifically monitors for near-identical repetition within a window — it catches pathological non-progress earlier and cheaper than letting the run exhaust its full step budget. max_steps is a hard ceiling that fires regardless of whether progress looked healthy or not.",
      difficulty: "intermediate",
    },
    {
      id: "agents-q3",
      question: "During a human-in-the-loop pause, what happens on the open SSE connection if the approval timeout expires with no response?",
      options: [
        "The connection silently closes with no further events",
        "The server emits an agent_step with type 'error', then run_complete with stopReason 'timeout', then done",
        "The agent automatically approves its own dangerous action and continues",
        "The stream retries the same step indefinitely until approved",
      ],
      correctIndex: 1,
      explanation: "A timed-out approval fails safely and explicitly: the stream emits an error step, a run_complete with stopReason 'timeout', and then the terminal done event — never a silent hang or an automatic self-approval.",
      difficulty: "intermediate",
    },
    {
      id: "agents-q4",
      question: "Why is a near-100% human-in-the-loop approval rate a potential warning sign rather than a sign the system is working well?",
      options: [
        "It's never a warning sign — a high approval rate always means the agent is well-behaved",
        "It can indicate approvals are being rubber-stamped without real review, which weakens the actual protection HITL is supposed to provide",
        "It means loop detection is disabled",
        "It means the agent never calls dangerous tools",
      ],
      correctIndex: 1,
      explanation: "HITL's protective value depends on approvals actually being scrutinized. If every request is approved near-instantly regardless of content, that's a signal the review step may have become a formality rather than a real safeguard — worth auditing, not celebrating.",
      difficulty: "senior",
    },
    {
      id: "agents-q5",
      question: "An agent's long-term (vector) memory contains a conclusion from an earlier run that was later found to be wrong. What's the structural problem this reveals?",
      options: [
        "Vector memory should never be used by agents under any circumstances",
        "Without provenance/confidence metadata and a correction or decay mechanism, wrong stored memories get retrieved and trusted indefinitely in future runs, just like correct ones",
        "This can only happen if loop detection is disabled",
        "This is purely a vector database bug, unrelated to agent design",
      ],
      correctIndex: 1,
      explanation: "Long-term memory retrieval has no built-in way to distinguish a verified fact from a previously-wrong conclusion unless the system explicitly tracks that metadata and provides a way to correct or decay entries. Without it, errors compound silently across runs.",
      difficulty: "senior",
    },
  ],
  presets: [
    {
      id: "agents-tool-use-trace",
      label: "A multi-step research task with full tool trace",
      description: "Give the agent a goal requiring 3-4 tool calls and step through the agent_step trace to see exactly how it decided what to do at each point.",
    },
    {
      id: "agents-loop-detection-trigger",
      label: "Deliberately trigger loop detection",
      description: "Set a goal the agent can't actually complete with its given tools and watch loop detection catch the repetition before max_steps would have.",
    },
    {
      id: "agents-hitl-approval-flow",
      label: "A dangerous tool call that requires approval",
      description: "Trigger a step that calls a tool marked dangerous, watch the stream pause at approval_request, then approve or deny it and see the run resume or terminate accordingly.",
    },
    {
      id: "agents-mcp-tool-discovery",
      label: "Discover and call a tool from a mock MCP server",
      description: "List the tools exposed by an in-process mock MCP server and invoke one directly, then compare that to the same tool being used inside a full agent run.",
    },
  ],
};

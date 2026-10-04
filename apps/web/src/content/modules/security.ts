import type { ModuleContent } from "../types";

export const securityContent: ModuleContent = {
  moduleId: "security",
  learn: {
    moduleId: "security",
    summary: {
      beginner:
        "LLM applications have their own unique attack types, like prompt injection — tricking the model with crafted text instead of exploiting a traditional software bug. Guardrails are the layered defenses that catch these attacks.",
      intermediate:
        "Direct injection comes from user input; indirect injection hides in retrieved documents or tool results the application implicitly trusts. No single defense is complete — instruction hierarchy, least-privilege tool access, input/output filtering, and human review each catch a different slice of the risk.",
      senior:
        "Defense in depth is the only honest security posture here: every individual layer (instruction hierarchy, moderation classifiers, output validation) has documented bypasses, so the real question for any guardrail is 'if this specific layer fails, what's the next layer that still catches it?' The vulnerable demo bot in this module is deliberately exploitable — safely, with mock tools only — precisely so you can see each layer's actual, measured effect rather than taking it on faith.",
    },
    explain: [
      {
        heading: "Prompt injection is the SQL-injection of the LLM era",
        body: "Because instructions and data share the same text channel, there's no hard syntactic wall preventing attacker-controlled input from being interpreted as a command. Direct injection comes straight from a user's own input; indirect injection hides inside content the application retrieves or processes — a document, a web page, a tool's return value — which the victim never typed themselves.",
      },
      {
        heading: "Guardrails are layered on purpose, not redundantly",
        body: "`/guardrails/attack` runs a chosen attack against the deliberately vulnerable demo bot and emits a `stage` event per guardrail layer evaluated, each carrying its own `GuardrailReport` — so you can see exactly which layer (if any) caught a given attack, and which layers would have let it through on their own.",
      },
      {
        heading: "Least privilege bounds the damage regardless of why things went wrong",
        body: "Whether a bad tool call happened because of a successful injection or just an honest model mistake, giving the agent only the narrowest tools and permissions it actually needs for the task limits the blast radius either way. This is why the tool registry, not the system prompt, is the real control surface.",
      },
    ],
    underTheHood: [
      {
        heading: "The attack catalog and payloads stay server-side, deliberately",
        body: "`/guardrails/attacks` serves the catalog of named attacks (with OWASP mappings) from the API rather than frontend content specifically so the actual attack payloads never ship as copy-pasteable client-side strings — the vulnerable bot and its attacks are contained entirely to this app's server, with mock tools only, regardless of which provider/model is selected.",
      },
      {
        heading: "Every non-allow finding writes an audit entry",
        body: "Any `GuardrailFinding` with `action !== 'allow'` writes an `AuditLogEntry`, queryable via `/guardrails/audit-log` — this is what turns 'we have guardrails' into something you can actually review after the fact: what was blocked, when, and under which config.",
      },
      {
        heading: "Config changes are themselves audited",
        body: "`PUT /guardrails/config` writes its own `AuditLogEntry` (`action: 'guardrail.config.update'`) — loosening or tightening defenses is a tracked event, not a silent toggle, which matters when reconstructing why a later attack succeeded or failed.",
      },
    ],
    seniorGotchas: [
      {
        heading: "Indirect injection is the higher-risk case precisely because the victim is innocent",
        body: "A user asking an innocuous question about a document can still trigger an attack if that document contains injected instructions — the user never did anything wrong, which means input-side scrutiny of the user's own message catches none of this. Retrieved and tool-result content needs to be treated as untrusted data, never as instructions, regardless of how it got into context.",
      },
      {
        heading: "Delimiters and instruction hierarchy reduce risk, they don't eliminate it",
        body: "A sufficiently crafted input can still mimic or break out of a delimiter, and instruction-hierarchy training is a probabilistic tendency, not an enforced rule. Treat both as one layer among several, never as sufficient on their own for anything with real stakes.",
      },
      {
        heading: "A moderation classifier's false-negative rate is a product decision, not a solved problem",
        body: "Every moderation/PII classifier trades false positives against false negatives, and the acceptable point on that curve depends on what's actually at stake in your application — a generic 'good enough' threshold copied from elsewhere isn't a substitute for testing against your own risk profile.",
      },
      {
        heading: "Tool abuse hijacks legitimate capability, it doesn't need a new exploit",
        body: "An attacker doesn't need to introduce a new tool — tricking an agent into misusing a tool it legitimately has (send-email, delete-file) via injected instructions is enough. This is exactly why dangerous tools need human-in-the-loop gating or strict argument validation, not just a registry listing.",
      },
    ],
  },
  pitfalls: [
    {
      id: "security-indirect-injection-via-rag",
      title: "A RAG document containing hidden instructions successfully manipulates the model",
      symptom: "An agent answering a user's innocuous question unexpectedly reveals system prompt contents or takes an unintended action.",
      cause: "A retrieved document contained text crafted to look like a system instruction, and the application treated retrieved content with the same instruction-following weight as its own system/developer prompt.",
      fix: "Explicitly mark retrieved/tool content as untrusted data (via delimiters and prompt framing) and never let it carry the same instruction priority as the system/developer prompt; validate outputs regardless of what triggered the generation.",
      severity: "high",
    },
    {
      id: "security-single-layer-defense",
      title: "An attack bypasses the only guardrail layer that was enabled",
      symptom: "A known jailbreak technique succeeds even though 'guardrails were on.'",
      cause: "Only one defense layer (e.g. a keyword filter) was enabled, and that specific layer has a documented bypass for this attack category — there was no second layer to catch what the first missed.",
      fix: "Run the attack catalog against each guardrail layer individually and in combination to measure what each layer actually catches, and ensure genuinely independent layers (input filtering, instruction hierarchy, output validation, least privilege) are all active for anything handling untrusted input.",
      severity: "high",
    },
    {
      id: "security-tool-abuse-no-approval",
      title: "An injected instruction causes a legitimate tool to be misused",
      symptom: "A send-email or file-modification tool executes an action the user never asked for.",
      cause: "The tool wasn't gated behind human-in-the-loop approval despite being capable of a real-world side effect, so an injected instruction could trigger it without any review checkpoint.",
      fix: "Mark any tool capable of a real side effect as dangerous and require approval (or at minimum strict argument validation against the user's actual request) before execution.",
      severity: "high",
    },
    {
      id: "security-pii-regex-only",
      title: "PII redaction misses a name embedded in ordinary sentence context",
      symptom: "A person's name slips through into logs even though email/phone redaction appears to be working.",
      cause: "Redaction relied purely on pattern-matching for structured PII (emails, phone numbers) with no entity-level detection for context-dependent PII like names in prose.",
      fix: "Combine pattern-based redaction with a model-based or rule-based entity classifier for context-dependent PII, and treat redaction as probabilistic risk reduction that needs ongoing measurement, not a one-time guarantee.",
      severity: "medium",
    },
  ],
  quiz: [
    {
      id: "security-q1",
      question: "What distinguishes indirect prompt injection from direct prompt injection?",
      options: [
        "Indirect injection requires admin access to the system",
        "Indirect injection arrives via content the application retrieves or processes (a document, a tool result), not via the user's own typed input",
        "Indirect injection only affects image inputs",
        "There is no real difference between the two",
      ],
      correctIndex: 1,
      explanation: "Indirect injection hides malicious instructions inside retrieved or tool-sourced content that the application implicitly trusts as 'data,' rather than coming from anything the user themselves typed — which is exactly why it's often considered higher-risk: the victim did nothing wrong.",
      difficulty: "beginner",
    },
    {
      id: "security-q2",
      question: "Why is 'the instruction hierarchy makes the system prompt safe from override' considered an overstatement?",
      options: [
        "Because instruction hierarchy training has no measurable effect at all",
        "Because it's a trained, probabilistic tendency that reduces but doesn't guarantee resistance to a sufficiently crafted injection — real enforcement still needs to happen in code",
        "Because system prompts are always publicly visible anyway",
        "Because instruction hierarchy only applies to few-shot examples",
      ],
      correctIndex: 1,
      explanation: "Instruction hierarchy measurably reduces injection success rates but is not an absolute guarantee — it's one layer in a defense-in-depth strategy, not a substitute for code-level enforcement like tool allow-lists and output validation.",
      difficulty: "senior",
    },
    {
      id: "security-q3",
      question: "An attack successfully bypasses a keyword-based input filter. What does defense-in-depth say should happen next?",
      options: [
        "Nothing — a single well-tuned filter is sufficient if it's comprehensive enough",
        "A different, independent layer (instruction hierarchy, output validation, least-privilege tool access) should still have a chance to catch what the first layer missed",
        "The system should shut down entirely until the filter is patched",
        "The attack should be ignored since the filter already ran",
      ],
      correctIndex: 1,
      explanation: "Defense in depth assumes any single layer can be bypassed — the question for a mature guardrail system is always 'what's the next independent layer that still catches this,' not whether any one layer can be made perfect.",
      difficulty: "intermediate",
    },
    {
      id: "security-q4",
      question: "Why does this app keep the attack catalog's actual payloads server-side rather than in frontend content?",
      options: [
        "To make the frontend bundle smaller for performance reasons only",
        "So the attack strings never ship as copy-pasteable client-side text that could accidentally be reused against a real, non-demo provider",
        "Because frontend code cannot store string arrays",
        "It's an arbitrary stylistic choice with no security rationale",
      ],
      correctIndex: 1,
      explanation: "CLAUDE.md requires the vulnerable bot and its attacks to be contained to the app and safe to run even with real provider keys configured. Keeping payloads server-side (not shipped as reusable client-side strings) reduces the risk of them being copy-pasted and tried against an unrelated real system by accident.",
      difficulty: "senior",
    },
    {
      id: "security-q5",
      question: "Tool abuse via prompt injection manipulates an agent into misusing a 'send_email' tool it legitimately has access to. What's the most direct mitigation?",
      options: [
        "Remove all tools from every agent permanently",
        "Require human-in-the-loop approval (or strict argument validation against the user's actual request) for tools capable of real side effects, regardless of how the call was triggered",
        "Rely solely on the system prompt telling the model not to misuse tools",
        "Tool abuse cannot be mitigated and should be accepted as an inherent risk",
      ],
      correctIndex: 1,
      explanation: "Tool abuse doesn't require a new exploit — it hijacks existing legitimate capability via injected instructions. The mitigation that actually works regardless of how the bad call was triggered is gating dangerous tools behind human review or strict validation, not trusting prompt-level instructions to prevent misuse.",
      difficulty: "intermediate",
    },
  ],
  presets: [
    {
      id: "security-attack-then-defend",
      label: "Run a direct injection attack, then enable defenses and re-run",
      description: "Attack the vulnerable bot with no guardrails enabled, observe the result, then enable the full guardrail config and re-run the identical attack to see what changed.",
    },
    {
      id: "security-indirect-via-document",
      label: "Indirect injection hidden in a retrieved document",
      description: "Plant an injected instruction inside a document the bot retrieves, and see whether it succeeds despite the user's own message being completely innocuous.",
    },
    {
      id: "security-owasp-category-tour",
      label: "One attack per OWASP LLM Top 10 category",
      description: "Run one representative attack from each OWASP category against the bot and review the owasp-map to see which guardrail layers map to which risk.",
    },
    {
      id: "security-audit-log-review",
      label: "Review the audit log after a batch of attacks",
      description: "Run several attacks with varying guardrail configs, then inspect the audit log to see every blocked/flagged finding and the config that was active at the time.",
    },
  ],
};

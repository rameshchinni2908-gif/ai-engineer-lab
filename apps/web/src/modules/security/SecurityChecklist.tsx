import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

const CHECKLIST_ITEMS: { title: string; detail: string }[] = [
  {
    title: "Hallucination mitigation",
    detail: "Ground answers in retrieved/cited sources, add an explicit \"say you don't know\" instruction, and run factuality checks (e.g. the Evals module's RAG faithfulness metric) before shipping a prompt change.",
  },
  {
    title: "Output moderation",
    detail: "Every response passes through moderation (this module's outputModeration layer) before it reaches a user or another tool - never just at the input side.",
  },
  {
    title: "Bias testing",
    detail: "Run the same prompt across demographic-varied inputs and compare outcomes; track disparate-impact metrics over time, not just a one-time audit.",
  },
  {
    title: "Audit logging",
    detail: "Every guardrail decision and config change is recorded (see the audit log below) with enough detail to reconstruct why an attack succeeded or failed after the fact.",
  },
  {
    title: "Least privilege by default",
    detail: "Tools and data access start minimal and are expanded deliberately, never the reverse - the allow-list is the real control surface, not prompt wording.",
  },
  {
    title: "Rate limiting and abuse detection",
    detail: "Per-session/per-IP limits catch scripted abuse that a single-request guardrail check can't - burst behavior is itself a signal.",
  },
  {
    title: "Human approval for irreversible actions",
    detail: "Anything with a real-world side effect (sending data externally, deleting records) needs a human-in-the-loop gate, regardless of how confident the model seems.",
  },
  {
    title: "Defense in depth, measured not assumed",
    detail: "Periodically re-run the attack library against the current config - a layer that caught an attack last quarter may have a regression or bypass today.",
  },
];

/** Production security checklist (M8). Short, concrete items - not a substitute for the Learn tab's deeper explanations. */
export function SecurityChecklist(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Production security checklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {CHECKLIST_ITEMS.map((item) => (
          <div key={item.title} className="rounded-md border border-border p-2 text-sm">
            <h4 className="font-medium">{item.title}</h4>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

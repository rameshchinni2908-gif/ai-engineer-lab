import { useDifficulty } from "@/hooks/useDifficulty";
import { AutoLinkedText } from "@/components/GlossaryTerm";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import type { ModuleLearnContent, Pitfall } from "@/content/types";

/** Learn-tab renderer for Agents: summary + explain/under-the-hood/senior-gotchas accordion (same pattern as the other M1-M5 modules). */
export function LearnTabContent({ content }: { content: ModuleLearnContent }): JSX.Element {
  const { pick, isAtLeast } = useDifficulty();

  return (
    <div className="space-y-4 text-sm">
      <p>{pick(content.summary)}</p>
      <Accordion type="multiple" defaultValue={["explain"]} className="w-full">
        <AccordionItem value="explain">
          <AccordionTrigger>Explain</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.explain.map((block) => (
              <div key={block.heading}>
                <h4 className="font-semibold">{block.heading}</h4>
                <p className="text-foreground">
                  <AutoLinkedText text={block.body} />
                </p>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="under-the-hood">
          <AccordionTrigger>Under the hood</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.underTheHood.map((block) => (
              <div key={block.heading}>
                <h4 className="font-semibold">{block.heading}</h4>
                <p className="text-foreground">
                  <AutoLinkedText text={block.body} />
                </p>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
        {isAtLeast("senior") && (
          <AccordionItem value="gotchas">
            <AccordionTrigger>Senior gotchas</AccordionTrigger>
            <AccordionContent className="space-y-3">
              {content.seniorGotchas.map((block) => (
                <div key={block.heading}>
                  <h4 className="font-semibold">{block.heading}</h4>
                  <p className="text-foreground">
                    <AutoLinkedText text={block.body} />
                  </p>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

const severityVariant = { low: "outline", medium: "warning", high: "destructive" } as const;

/** Pitfalls-tab renderer: symptom -> cause -> fix cards, plus the required "when NOT to use an agent" trade-off comparison (deliverable #7 - owned by agent-engineer, not content-writer). */
export function PitfallsList({ pitfalls }: { pitfalls: Pitfall[] }): JSX.Element {
  return (
    <div className="space-y-6">
      {pitfalls.length === 0 ? (
        <EmptyState title="No pitfalls documented yet" />
      ) : (
        <div className="space-y-3">
          {pitfalls.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="font-semibold">{p.title}</h4>
                <Badge variant={severityVariant[p.severity]}>{p.severity}</Badge>
              </div>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="font-medium text-muted-foreground">Symptom</dt>
                  <dd>{p.symptom}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Cause</dt>
                  <dd>{p.cause}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Fix</dt>
                  <dd>{p.fix}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
      <AgentVsWorkflowComparison />
    </div>
  );
}

interface ComparisonRow {
  approach: string;
  whenToUse: string;
  cost: string;
  latency: string;
  reliability: string;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    approach: "Single LLM call",
    whenToUse: "The task is answerable from the prompt alone, in one shot, with no external action needed.",
    cost: "Lowest - one call, bounded tokens.",
    latency: "Lowest - one round trip.",
    reliability: "Highest variance comes only from the model itself; nothing else can fail.",
  },
  {
    approach: "Fixed workflow (deterministic pipeline of calls/tools)",
    whenToUse: "The steps are known in advance and don't need to branch based on intermediate results.",
    cost: "Predictable - N calls, N known costs; easy to budget exactly.",
    latency: "Predictable - sum of fixed steps; easy to put an SLA on.",
    reliability: "High - no open-ended decision loop to get stuck in; failures are isolated per step.",
  },
  {
    approach: "Agent (ReAct / plan-execute / reflection / supervisor-worker)",
    whenToUse: "The number and order of steps genuinely depends on what earlier steps return - real branching, not just a fixed sequence.",
    cost: "Highest and least predictable - step count varies per run; MUST be bounded (budgetUsd, maxSteps) or it can run away.",
    latency: "Highest and least predictable - every extra step is a full round trip; MUST be bounded (timeoutMs) or a run can hang.",
    reliability: "Lowest without controls - can loop, stall, or confidently go down the wrong path; loop detection + approval gates are what make it production-safe, not optional extras.",
  },
];

/** Deliverable #7: an honest cost/latency/reliability comparison, so "when to reach for an agent" isn't a vibe-based decision. */
function AgentVsWorkflowComparison(): JSX.Element {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">When NOT to use an agent</h3>
      <p className="text-sm text-muted-foreground">
        An agent is the most expensive, slowest, and least reliable of these three options by
        default - it earns its cost only when the task genuinely needs multi-step branching
        decided at runtime. If a fixed sequence of steps would get the same result, build that
        instead; it is cheaper, faster, and cannot get stuck in a loop.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Approach</TableHead>
              <TableHead>When to use it</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Reliability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {COMPARISON_ROWS.map((row) => (
              <TableRow key={row.approach}>
                <TableCell className="font-medium">{row.approach}</TableCell>
                <TableCell className="max-w-xs text-sm text-muted-foreground">{row.whenToUse}</TableCell>
                <TableCell className="max-w-xs text-sm text-muted-foreground">{row.cost}</TableCell>
                <TableCell className="max-w-xs text-sm text-muted-foreground">{row.latency}</TableCell>
                <TableCell className="max-w-xs text-sm text-muted-foreground">{row.reliability}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

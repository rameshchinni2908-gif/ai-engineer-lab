import type { ModuleLearnContent, Pitfall } from "@/content/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from "@/components/ui";
import { AutoLinkedText } from "@/components/GlossaryTerm";
import { useDifficulty } from "@/hooks/useDifficulty";

/** Shared-shape Learn tab renderer (CLAUDE.md: Explain / under-the-hood / senior gotchas), duplicated per-module by design (each Wave-2 module owns only its own folder). */
export function LearnTabContent({ content }: { content: ModuleLearnContent }): JSX.Element {
  const { pick, isAtLeast } = useDifficulty();
  return (
    <div className="space-y-4 text-sm">
      <p>{pick(content.summary)}</p>
      <Accordion type="multiple" defaultValue={["explain-0"]}>
        {content.explain.map((block, i) => (
          <AccordionItem key={`explain-${i}`} value={`explain-${i}`}>
            <AccordionTrigger>{block.heading}</AccordionTrigger>
            <AccordionContent>
              <AutoLinkedText text={block.body} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {isAtLeast("intermediate") && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Under the hood</h3>
          <Accordion type="multiple">
            {content.underTheHood.map((block, i) => (
              <AccordionItem key={`uth-${i}`} value={`uth-${i}`}>
                <AccordionTrigger>{block.heading}</AccordionTrigger>
                <AccordionContent><AutoLinkedText text={block.body} /></AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
      {isAtLeast("senior") && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Senior gotchas</h3>
          <Accordion type="multiple">
            {content.seniorGotchas.map((block, i) => (
              <AccordionItem key={`gotcha-${i}`} value={`gotcha-${i}`}>
                <AccordionTrigger>{block.heading}</AccordionTrigger>
                <AccordionContent><AutoLinkedText text={block.body} /></AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );
}

const SEVERITY_VARIANT: Record<Pitfall["severity"], "outline" | "warning" | "destructive"> = {
  low: "outline",
  medium: "warning",
  high: "destructive",
};

/** Shared-shape Pitfalls tab renderer, duplicated per-module (see note above). */
export function PitfallsList({ pitfalls }: { pitfalls: Pitfall[] }): JSX.Element {
  return (
    <div className="space-y-3">
      {pitfalls.map((p) => (
        <div key={p.id} className="rounded-lg border border-border p-3">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-semibold">{p.title}</h3>
            <Badge variant={SEVERITY_VARIANT[p.severity]}>{p.severity}</Badge>
          </div>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline font-medium">Symptom: </dt><dd className="inline text-muted-foreground">{p.symptom}</dd></div>
            <div><dt className="inline font-medium">Cause: </dt><dd className="inline text-muted-foreground">{p.cause}</dd></div>
            <div><dt className="inline font-medium">Fix: </dt><dd className="inline text-muted-foreground">{p.fix}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}

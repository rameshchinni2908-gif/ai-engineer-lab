import { useDifficulty } from "@/hooks/useDifficulty";
import { AutoLinkedText } from "@/components/GlossaryTerm";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import type { ModuleLearnContent, Pitfall } from "@/content/types";

/** Shared Learn-tab renderer: summary + explain/under-the-hood/senior-gotchas accordion. */
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
                <p className="text-muted-foreground">
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
                <p className="text-muted-foreground">
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
                  <p className="text-muted-foreground">
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

const severityVariant = {
  low: "outline",
  medium: "warning",
  high: "destructive",
} as const;

/** Shared Pitfalls-tab renderer: symptom -> cause -> fix cards from `MODULE_CONTENT`. */
export function PitfallsList({ pitfalls }: { pitfalls: Pitfall[] }): JSX.Element {
  if (pitfalls.length === 0) {
    return <EmptyState title="No pitfalls documented yet" />;
  }
  return (
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
  );
}

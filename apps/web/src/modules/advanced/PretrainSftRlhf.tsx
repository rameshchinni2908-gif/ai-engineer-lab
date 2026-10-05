import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";

const STAGES = [
  {
    id: "pretrain",
    glossaryId: "pretraining",
    label: "1. Pretraining",
    whatChanges: "The model learns general language patterns via next-token prediction.",
    dataNeeded: "A massive, broad, largely uncurated text (and often code/multimodal) corpus.",
    costShape: "By far the largest compute cost of the whole pipeline - typically the majority of total training spend.",
  },
  {
    id: "sft",
    glossaryId: "supervised-fine-tuning",
    label: "2. Supervised fine-tuning (SFT)",
    whatChanges: "The model learns to follow instructions and produce the expected response FORMAT, using the pretrained model as a starting point.",
    dataNeeded: "A curated set of (instruction, ideal response) example pairs - far smaller than the pretraining corpus, but requires real human/editorial curation.",
    costShape: "Much cheaper than pretraining, but not free - curation quality matters more than raw volume here.",
  },
  {
    id: "rlhf-dpo",
    glossaryId: "rlhf",
    label: "3. RLHF / DPO",
    whatChanges: "The model is further aligned toward human preference (helpfulness, harmlessness, style) using comparison data, not just correctness.",
    dataNeeded: "Pairwise or ranked human (or AI-assisted) preference comparisons between candidate responses.",
    costShape: "Cheaper than SFT in raw compute, but comparison-data collection has its own real labeling cost and is easy to under-invest in.",
  },
];

/**
 * M10 pretrain -> SFT -> RLHF/DPO visual: what changes, what data it needs,
 * and the relative cost shape at each stage. Qualitative/relative claims
 * only (e.g. "by far the largest cost") - no invented absolute numbers,
 * consistent with CLAUDE.md's "never present invented numbers as authoritative."
 */
export function PretrainSftRlhf(): JSX.Element {
  const [active, setActive] = React.useState(STAGES[0]!.id);
  const stage = STAGES.find((s) => s.id === active)!;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pretrain &rarr; SFT &rarr; RLHF/DPO</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {STAGES.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                type="button"
                onClick={() => setActive(s.id)}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge variant={active === s.id ? "default" : "outline"}>{s.label}</Badge>
              </button>
              {i < STAGES.length - 1 && <span aria-hidden="true" className="text-muted-foreground">&rarr;</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="space-y-2 text-sm">
          <h4 className="font-semibold">
            <GlossaryTerm id={stage.glossaryId}>{stage.label}</GlossaryTerm>
          </h4>
          <p><span className="font-medium">What changes: </span>{stage.whatChanges}</p>
          <p><span className="font-medium">Data needed: </span>{stage.dataNeeded}</p>
          <p><span className="font-medium">Cost shape: </span>{stage.costShape}</p>
        </div>
      </CardContent>
    </Card>
  );
}

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import type { Message } from "@ail/shared";
import { MODEL_CATALOG } from "@ail/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { computeContextWindow, type ContextStrategy, type ContextWindowResponse } from "./api";

const STRATEGIES: { id: ContextStrategy; label: string; glossaryId: string }[] = [
  { id: "truncate-oldest", label: "Truncate oldest", glossaryId: "truncate-oldest" },
  { id: "truncate-middle", label: "Truncate middle", glossaryId: "truncate-middle" },
  { id: "sliding-window", label: "Sliding window", glossaryId: "sliding-window" },
  { id: "summarize", label: "Summarize oldest", glossaryId: "conversation-summarization" },
];

const FILLER =
  "Here is a reasonably long message that stands in for a real turn of conversation, padded out with extra words so it costs a meaningful number of tokens against the context budget.";

function buildBaseConversation(): Message[] {
  const turns: Message[] = [{ role: "system", content: "You are a helpful assistant." }];
  for (let i = 0; i < 6; i++) {
    turns.push({ role: i % 2 === 0 ? "user" : "assistant", content: `Turn ${i + 1}: ${FILLER}` });
  }
  return turns;
}

function messageKey(m: Message): string {
  return `${m.role}:${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`;
}

/** Client-side mirror of the server's multiset diff: which original messages survived into `truncated`, plus any synthetic messages (e.g. a "summarize" strategy's summary) that appear in `truncated` but weren't in `original`. */
function classifyKept(original: Message[], truncated: Message[]): { kept: boolean[]; synthetic: Message[] } {
  const remaining = new Map<string, number>();
  for (const m of truncated) {
    const k = messageKey(m);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  const kept = original.map((m) => {
    const k = messageKey(m);
    const count = remaining.get(k) ?? 0;
    if (count > 0) {
      remaining.set(k, count - 1);
      return true;
    }
    return false;
  });
  const synthetic = truncated.filter((m) => {
    const k = messageKey(m);
    const count = remaining.get(k) ?? 0;
    if (count > 0) {
      remaining.set(k, count - 1);
      return true;
    }
    return false;
  });
  return { kept, synthetic };
}

/** M1 context-window meter + truncation strategy comparison. */
export function ContextWindowMeter(): JSX.Element {
  const [repeats, setRepeats] = React.useState(1);
  const [model, setModel] = React.useState("mock-small");
  const [strategy, setStrategy] = React.useState<ContextStrategy>("truncate-oldest");

  const messages = React.useMemo<Message[]>(() => {
    const base = buildBaseConversation();
    const [system, ...rest] = base;
    const repeated = Array.from({ length: repeats }, () => rest).flat();
    return [system!, ...repeated];
  }, [repeats]);

  const mutation = useMutation({
    mutationFn: () => computeContextWindow({ messages, model, strategy }),
  });

  const result: ContextWindowResponse | undefined = mutation.data;
  const modelInfo = MODEL_CATALOG.find((m) => m.id === model);
  const outputReserve = modelInfo ? Math.min(modelInfo.maxOutputTokens, 1024) : 0;
  const budget = modelInfo ? modelInfo.contextWindow - outputReserve : 0;
  const classification = result ? classifyKept(messages, result.truncatedMessages) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <GlossaryTerm id="context-window">Context window</GlossaryTerm> meter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="cw-model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="cw-model" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_CATALOG.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName} ({m.contextWindow.toLocaleString()} tok)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cw-repeats">Repeat conversation</Label>
            <Input
              id="cw-repeats"
              type="number"
              min={1}
              max={400}
              value={repeats}
              onChange={(e) => setRepeats(Math.max(1, Math.min(400, Number(e.target.value) || 1)))}
              className="w-24"
            />
          </div>
          <div>
            <Label htmlFor="cw-strategy">Truncation strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as ContextStrategy)}>
              <SelectTrigger id="cw-strategy" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Computing..." : "Check fit"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {messages.length} messages built ({repeats}x repeat of a 6-turn base conversation, plus 1 pinned system
          message). Output reserve for this model is estimated at {outputReserve.toLocaleString()} tokens, leaving an
          input budget of ~{budget.toLocaleString()} tokens.
        </p>

        {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}

        {result && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>
                  {result.usedTokens.toLocaleString()} / {result.contextWindow.toLocaleString()} tokens used
                </span>
                <Badge variant={result.fits ? "success" : "destructive"}>{result.fits ? "fits" : "overflow"}</Badge>
              </div>
              <Progress value={Math.min(100, (result.usedTokens / result.contextWindow) * 100)} />
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">strategy applied: {result.strategyApplied}</Badge>
              <Badge variant="outline">dropped: {result.droppedCount}</Badge>
              <Badge variant="outline">surviving messages: {result.truncatedMessages.length}</Badge>
            </div>

            {classification && (
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Role</th>
                      <th className="p-2">Content</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((m, i) => (
                      <tr key={i} className={classification.kept[i] ? "" : "opacity-50 line-through"}>
                        <td className="p-2">{i}</td>
                        <td className="p-2">{m.role}</td>
                        <td className="max-w-md truncate p-2">
                          {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
                        </td>
                        <td className="p-2">
                          <Badge variant={classification.kept[i] ? "success" : "outline"}>
                            {classification.kept[i] ? "kept" : "dropped"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {classification.synthetic.map((m, i) => (
                      <tr key={`synthetic-${i}`} className="bg-sky-50 dark:bg-sky-950">
                        <td className="p-2">+</td>
                        <td className="p-2">{m.role}</td>
                        <td className="max-w-md truncate p-2">
                          {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
                        </td>
                        <td className="p-2">
                          <Badge variant="secondary">added by strategy</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.strategyApplied === "summarize" && (
              <p className="text-xs text-muted-foreground">
                The "summarize" strategy replaces the dropped block with one synthetic system message (visible at the
                top of the surviving list above as a "kept" system-role row) produced by a real, separately-costed
                LLM call.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

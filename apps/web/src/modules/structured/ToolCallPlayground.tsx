import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { useSse } from "@/hooks/useSse";
import { useRunShortcut } from "@/hooks/useKeyboardShortcuts";
import { useProviderModelStore } from "@/stores/provider-model";

export interface ToolCallPlaygroundProps {
  onRunComplete?: (runId: string) => void;
}

const SAMPLE_QUESTIONS = [
  "What is 23 * 4 + 1?",
  "How many words are in the sentence 'the quick brown fox jumps over the lazy dog'?",
  "Reverse the text 'engineering', then tell me the result.",
];

type ToolChoice = "auto" | "required" | "none";

/** M3 tool-calling playground: sandboxed mock tools, full message trace (user -> assistant tool_use -> tool_result -> final). */
export function ToolCallPlayground({ onRunComplete }: ToolCallPlaygroundProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [question, setQuestion] = React.useState(SAMPLE_QUESTIONS[0]!);
  const [toolChoice, setToolChoice] = React.useState<ToolChoice>("auto");

  const { status, runs, error, start } = useSse(
    "/api/structured/tool-call",
    {
      providerId,
      model,
      messages: [{ role: "user", content: question }],
      tools: [],
      params: { toolChoice },
    },
    { autoStart: false },
  );
  useRunShortcut(start);

  const notifiedRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const [id, r] of Object.entries(runs)) {
      if (r.status === "complete" && !notifiedRef.current.has(id)) {
        notifiedRef.current.add(id);
        onRunComplete?.(id);
      }
    }
  }, [runs, onRunComplete]);

  const entry = Object.entries(runs)[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <GlossaryTerm id="tool-calling">Tool-calling</GlossaryTerm> playground
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProviderModelSelector
          providerId={providerId}
          model={model}
          onChange={(next) => {
            setProviderId(next.providerId);
            setModel(next.model);
          }}
        />

        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((q, i) => (
            <Button key={i} size="sm" variant="outline" onClick={() => setQuestion(q)}>
              Sample {i + 1}
            </Button>
          ))}
        </div>

        <div>
          <Label htmlFor="tool-call-question">Question</Label>
          <Textarea id="tool-call-question" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="tool-choice">toolChoice</Label>
          <Select value={toolChoice} onValueChange={(v) => setToolChoice(v as ToolChoice)}>
            <SelectTrigger id="tool-choice" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">auto</SelectItem>
              <SelectItem value="required">required</SelectItem>
              <SelectItem value="none">none</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={start} disabled={status === "connecting" || status === "streaming"}>
          {status === "connecting" || status === "streaming" ? "Running..." : "Ask (Ctrl/Cmd+Enter)"}
        </Button>

        {error && <ErrorState message={error.message} />}

        {entry && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {entry[1].events
                .filter((e) => e.type === "tool_call" || e.type === "tool_result")
                .map((e, i) =>
                  e.type === "tool_call" ? (
                    <Badge key={i} variant="secondary">
                      tool_call: {e.toolCall.name}({JSON.stringify(e.toolCall.arguments)})
                    </Badge>
                  ) : e.type === "tool_result" ? (
                    <Badge key={i} variant={e.toolResult.isError ? "destructive" : "outline"}>
                      tool_result: {e.toolResult.content}
                    </Badge>
                  ) : null,
                )}
            </div>

            <StreamingRegion
              text={entry[1].run?.output.text ?? ""}
              status={entry[1].status === "pending" ? "idle" : entry[1].status}
              tokenCount={entry[1].run?.usage.outputTokens}
              label="Final answer"
            />

            {entry[1].run && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Full message trace</h4>
                <ol className="space-y-1 text-xs">
                  {entry[1].run.input.messages.map((m, i) => (
                    <li key={i} className="rounded-md border border-border p-2">
                      <span className="font-semibold">{m.role}</span>:{" "}
                      <span className="font-mono">
                        {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

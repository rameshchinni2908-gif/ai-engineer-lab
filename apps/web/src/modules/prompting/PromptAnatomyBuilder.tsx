import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { apiFetch } from "@/lib/api";

interface AnatomyBlocks {
  system: string;
  role: string;
  context: string;
  examples: string;
  task: string;
  outputFormat: string;
}

const DEFAULT_BLOCKS: AnatomyBlocks = {
  system: "You are a precise, helpful assistant.",
  role: "You are a senior backend engineer reviewing a pull request.",
  context: "The PR adds a new /checkout endpoint that calls a payment provider.",
  examples: "Input: 'missing null check on amount' -> Output: 'Add a guard clause before line 42.'",
  task: "Review the diff below and list concrete, actionable issues.",
  outputFormat: "Return a markdown bullet list, one issue per line.",
}

type Delimiter = "none" | "xml" | "markdown";

function composePrompt(blocks: AnatomyBlocks, delimiter: Delimiter): string {
  const sections: { label: string; body: string }[] = [
    { label: "role", body: blocks.role },
    { label: "context", body: blocks.context },
    { label: "examples", body: blocks.examples },
    { label: "task", body: blocks.task },
    { label: "output_format", body: blocks.outputFormat },
  ].filter((s) => s.body.trim().length > 0);

  const body = sections
    .map((s) => {
      if (delimiter === "xml") return `<${s.label}>\n${s.body}\n</${s.label}>`;
      if (delimiter === "markdown") return `## ${s.label}\n${s.body}`;
      return `${s.label.toUpperCase()}: ${s.body}`;
    })
    .join("\n\n");

  return blocks.system.trim() ? `${blocks.system.trim()}\n\n${body}` : body;
}

/** M2 prompt anatomy builder: compose system/role/context/examples/task/output-format blocks, live-rendered. */
export function PromptAnatomyBuilder(): JSX.Element {
  const [blocks, setBlocks] = React.useState<AnatomyBlocks>(DEFAULT_BLOCKS);
  const [delimiter, setDelimiter] = React.useState<Delimiter>("xml");

  const rendered = composePrompt(blocks, delimiter);

  const tokenMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ tokenCount: number }>("/fundamentals/tokenize", {
        method: "POST",
        body: { text: rendered, model: "mock-small" },
      }),
  });

  function setBlock(key: keyof AnatomyBlocks, value: string): void {
    setBlocks((prev) => ({ ...prev, [key]: value }));
  }

  const fields: { key: keyof AnatomyBlocks; label: string; glossaryId?: string }[] = [
    { key: "system", label: "System" },
    { key: "role", label: "Role", glossaryId: "role-prompting" },
    { key: "context", label: "Context" },
    { key: "examples", label: "Examples" },
    { key: "task", label: "Task" },
    { key: "outputFormat", label: "Output format" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt anatomy builder</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`anatomy-${f.key}`}>{f.glossaryId ? <GlossaryTerm id={f.glossaryId}>{f.label}</GlossaryTerm> : f.label}</Label>
              <Textarea
                id={`anatomy-${f.key}`}
                rows={2}
                value={blocks[f.key]}
                onChange={(e) => setBlock(f.key, e.target.value)}
              />
            </div>
          ))}
          <div>
            <Label htmlFor="anatomy-delimiter">
              <GlossaryTerm id="delimiter">Delimiter style</GlossaryTerm>
            </Label>
            <Select value={delimiter} onValueChange={(v) => setDelimiter(v as Delimiter)}>
              <SelectTrigger id="anatomy-delimiter" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (plain labels)</SelectItem>
                <SelectItem value="xml">XML tags</SelectItem>
                <SelectItem value="markdown">Markdown headings</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Final rendered prompt</Label>
            <Button size="sm" variant="secondary" onClick={() => tokenMutation.mutate()} disabled={tokenMutation.isPending}>
              {tokenMutation.isPending ? "Counting..." : "Count tokens"}
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs">
            {rendered || "(empty - fill in at least one block)"}
          </pre>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{rendered.length} chars</Badge>
            {tokenMutation.data && <Badge variant="outline">{tokenMutation.data.tokenCount} tokens (mock-small)</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { MODEL_CATALOG } from "@ail/shared";
import { Button, Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, Badge, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { tokenize, type TokenizeResponse } from "./api";

const SAMPLE_TEXTS = [
  "The quick brown fox jumps over the lazy dog.",
  "function add(a, b) { return a + b; }",
  "El rápido zorro marrón salta sobre el perro perezoso.",
];

const PALETTE = [
  "bg-sky-200 dark:bg-sky-900",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-amber-200 dark:bg-amber-900",
  "bg-violet-200 dark:bg-violet-900",
  "bg-rose-200 dark:bg-rose-900",
  "bg-cyan-200 dark:bg-cyan-900",
];

/** M1 tokenizer visualizer: paste text, see coloured token boundaries, ids, byte counts. */
export function TokenizerVisualizer(): JSX.Element {
  const [text, setText] = React.useState(SAMPLE_TEXTS[0]!);
  const [model, setModel] = React.useState("mock-small");

  const mutation = useMutation({
    mutationFn: () => tokenize(text, model),
  });

  const result: TokenizeResponse | undefined = mutation.data;
  const charsPerToken = result && result.tokenCount > 0 ? (text.length / result.tokenCount).toFixed(2) : "-";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <GlossaryTerm id="tokenization">Tokenizer</GlossaryTerm> visualizer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SAMPLE_TEXTS.map((sample, i) => (
            <Button key={i} size="sm" variant="outline" onClick={() => setText(sample)}>
              Sample {i + 1}
            </Button>
          ))}
        </div>
        <Textarea
          aria-label="Text to tokenize"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Paste text, code, or non-English text here..."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger aria-label="Model" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_CATALOG.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || text.length === 0}>
            {mutation.isPending ? "Tokenizing..." : "Tokenize"}
          </Button>
        </div>

        {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">{result.tokenCount} tokens</Badge>
              <Badge variant="outline">{text.length} chars</Badge>
              <Badge variant="outline">{charsPerToken} chars/token</Badge>
            </div>
            <div className="flex flex-wrap gap-0.5 rounded-md border border-border p-3 font-mono text-sm leading-relaxed">
              {result.tokens.map((t, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`rounded px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${PALETTE[i % PALETTE.length]} ${/^\s+$/.test(t.text) ? "opacity-50" : ""}`}
                    >
                      {t.text === "" ? " " : t.text.replace(/ /g, "·")}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    id={t.id} · {t.bytes.length} byte{t.bytes.length === 1 ? "" : "s"}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              This is an approximate tokenizer (not the provider&apos;s real BPE/tiktoken vocabulary) - good enough to
              show that whitespace, punctuation, code, and non-English text all tokenize differently. Hover a token
              to see its id and UTF-8 byte count.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

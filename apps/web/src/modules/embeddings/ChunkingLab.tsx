import * as React from "react";
import type { Chunk, ChunkStrategy } from "@ail/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { ErrorState } from "@/components/EmptyState";
import { embeddingsApi } from "./api";

const SAMPLE_TEXT = `# Onboarding Guide

Welcome to the platform. This guide covers setup, configuration, and troubleshooting.

## Setup

Install the CLI tool and run \`init\` to create a new workspace. Setup usually takes under five minutes.

## Configuration

Edit the config file to set your API key and preferred region. Restart the service after any change.

## Troubleshooting

If the service fails to start, check the logs for a port conflict. Most issues resolve after a restart.`;

const STRATEGIES: { id: ChunkStrategy; label: string }[] = [
  { id: "fixed", label: "Fixed-size" },
  { id: "recursive", label: "Recursive" },
  { id: "sentence", label: "Sentence" },
  { id: "semantic", label: "Semantic" },
  { id: "markdown", label: "Markdown-aware" },
];

const PALETTE = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7", "#ef4444"];

/** M4: chunking lab - all five strategies with a visual boundary map + per-chunk size/overlap/token stats. */
export function ChunkingLab(): JSX.Element {
  const [text, setText] = React.useState(SAMPLE_TEXT);
  const [strategy, setStrategy] = React.useState<ChunkStrategy>("recursive");
  const [chunkSize, setChunkSize] = React.useState(20);
  const [chunkOverlap, setChunkOverlap] = React.useState(4);
  const [semanticThreshold, setSemanticThreshold] = React.useState(0.5);
  const [chunks, setChunks] = React.useState<Chunk[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    setError(null);
    try {
      const { chunks: c } = await embeddingsApi.chunkPreview(text, {
        strategy,
        chunkSize,
        chunkOverlap,
        semanticThreshold: strategy === "semantic" ? semanticThreshold : undefined,
      });
      setChunks(c);
    } catch (err) {
      setChunks(null);
      setError(err instanceof Error ? err.message : "Failed to chunk text");
    }
  }, [text, strategy, chunkSize, chunkOverlap, semanticThreshold]);

  const totalLength = text.length || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Chunking lab (<GlossaryTerm id="chunking">chunk boundaries</GlossaryTerm>)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="chunk-lab-text">Source text</Label>
          <Textarea id="chunk-lab-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="chunk-lab-strategy">Strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as ChunkStrategy)}>
              <SelectTrigger id="chunk-lab-strategy">
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
          <div>
            <Label htmlFor="chunk-lab-size">Chunk size (approx. tokens)</Label>
            <Input
              id="chunk-lab-size"
              type="number"
              min={1}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="chunk-lab-overlap">Overlap (tokens)</Label>
            <Input
              id="chunk-lab-overlap"
              type="number"
              min={0}
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Number(e.target.value))}
            />
          </div>
          {strategy === "semantic" && (
            <div>
              <Label htmlFor="chunk-lab-threshold">Semantic threshold</Label>
              <Input
                id="chunk-lab-threshold"
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={semanticThreshold}
                onChange={(e) => setSemanticThreshold(Number(e.target.value))}
              />
            </div>
          )}
        </div>
        <Button onClick={run}>Preview chunks</Button>
        {error && <ErrorState message={error} />}

        {chunks && (
          <div className="space-y-4">
            <div>
              <h4 className="mb-1 text-sm font-semibold">Boundary map ({chunks.length} chunks)</h4>
              <div
                className="relative w-full rounded border border-border bg-muted/30"
                style={{ height: `${Math.max(chunks.length, 1) * 22 + 8}px` }}
                role="img"
                aria-label={`Boundary map showing ${chunks.length} chunk positions over the source text`}
              >
                {chunks.map((c, i) => {
                  const leftPct = (c.startOffset / totalLength) * 100;
                  const widthPct = Math.max(((c.endOffset - c.startOffset) / totalLength) * 100, 0.5);
                  return (
                    <div
                      key={c.id}
                      title={c.text.slice(0, 80)}
                      className="absolute h-4 rounded-sm opacity-80"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        top: `${i * 22 + 4}px`,
                        backgroundColor: PALETTE[i % PALETTE.length],
                      }}
                    />
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Each bar is one chunk, positioned by its character offset in the source text. Overlapping bars
                (same horizontal range, different rows) show where consecutive chunks share content.
              </p>
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-2">#</th>
                  <th className="pr-2">Chars</th>
                  <th className="pr-2">Tokens</th>
                  <th className="pr-2">Overlap w/ prev</th>
                  <th className="pr-2">Header path</th>
                  <th>Text</th>
                </tr>
              </thead>
              <tbody>
                {chunks.map((c, i) => {
                  const prev = chunks[i - 1];
                  const overlapChars = prev ? Math.max(0, prev.endOffset - c.startOffset) : 0;
                  const headerPath = (c.metadata.headerPath as string[] | undefined) ?? [];
                  return (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="pr-2">
                        <Badge style={{ backgroundColor: PALETTE[i % PALETTE.length] }} className="text-white">
                          {i}
                        </Badge>
                      </td>
                      <td className="pr-2">{c.endOffset - c.startOffset}</td>
                      <td className="pr-2">{c.tokenCount}</td>
                      <td className="pr-2">{overlapChars}</td>
                      <td className="pr-2">{headerPath.join(" > ") || "-"}</td>
                      <td className="max-w-md truncate">{c.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import * as React from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Textarea } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { EmptyState } from "@/components/EmptyState";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { useProviderModelStore } from "@/stores/provider-model";
import { embeddingsApi } from "./api";

const DEFAULT_TEXTS = [
  "The cat sat on the mat",
  "A kitten rested on the rug",
  "The stock market rallied today",
  "Shares rose sharply this afternoon",
  "The chef prepared a delicious meal",
  "Dinner was cooked with fresh ingredients",
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface EmbeddingExplorerProps {
  onRunComplete?: (runId: string) => void;
}

/** M4: embedding explorer - 2D PCA projection scatter, click a point to see its nearest neighbours by cosine similarity. */
export function EmbeddingExplorer({ onRunComplete }: EmbeddingExplorerProps): JSX.Element {
  const storeProviderId = useProviderModelStore((s) => s.providerId);
  const storeModel = useProviderModelStore((s) => s.model);
  const [providerId, setProviderId] = React.useState(storeProviderId);
  const [model, setModel] = React.useState(storeModel);
  const [raw, setRaw] = React.useState(DEFAULT_TEXTS.join("\n"));
  const [texts, setTexts] = React.useState<string[]>(DEFAULT_TEXTS);
  const [embeddings, setEmbeddings] = React.useState<number[][] | null>(null);
  const [points, setPoints] = React.useState<{ x: number; y: number }[] | null>(null);
  const [note, setNote] = React.useState<string | undefined>();
  const [selected, setSelected] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setError("Enter at least 2 lines of text to project.");
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const { embeddings: vecs, runId } = await embeddingsApi.embed(lines, providerId, model);
      const { points: pts, note: n } = await embeddingsApi.project2d(vecs, "pca");
      setTexts(lines);
      setEmbeddings(vecs);
      setPoints(pts);
      setNote(n);
      onRunComplete?.(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to embed/project");
    } finally {
      setLoading(false);
    }
  }, [raw, providerId, model, onRunComplete]);

  const neighbours = React.useMemo(() => {
    if (selected === null || !embeddings) return [];
    return embeddings
      .map((vec, i) => ({ index: i, text: texts[i]!, score: cosine(embeddings[selected]!, vec) }))
      .filter((n) => n.index !== selected)
      .sort((a, b) => b.score - a.score);
  }, [selected, embeddings, texts]);

  const chartData = points?.map((p, i) => ({ ...p, index: i, text: texts[i] })) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <GlossaryTerm id="embedding">Embedding</GlossaryTerm> explorer (PCA 2D projection)
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
        <div>
          <Label htmlFor="embed-explorer-texts">Texts to embed (one per line)</Label>
          <Textarea id="embed-explorer-texts" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} />
        </div>
        <Button onClick={run} disabled={loading}>
          {loading ? "Embedding..." : "Embed & project"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {note && <p className="text-xs text-muted-foreground">Note: {note}</p>}

        {!points ? (
          <EmptyState title="No projection yet" description="Click 'Embed & project' to see the 2D scatter." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="h-72 w-full" role="img" aria-label="2D PCA scatter plot of embedded texts">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" name="PC1" />
                  <YAxis type="number" dataKey="y" name="PC2" />
                  <RTooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload as { text: string };
                      return (
                        <div className="rounded border border-border bg-background p-2 text-xs shadow">{d.text}</div>
                      );
                    }}
                  />
                  <Scatter
                    data={chartData}
                    fill="var(--primary, #6366f1)"
                    onClick={(d: unknown) => setSelected((d as { index: number }).index)}
                    cursor="pointer"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Nearest neighbours</h4>
              {selected === null ? (
                <p className="text-sm text-muted-foreground">Click a point to inspect its nearest neighbours.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  <li className="font-medium">Selected: {texts[selected]}</li>
                  {neighbours.map((n) => (
                    <li key={n.index} className="flex items-center justify-between gap-2 border-t border-border pt-1">
                      <span className="truncate">{n.text}</span>
                      <Badge variant="outline">{n.score.toFixed(3)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

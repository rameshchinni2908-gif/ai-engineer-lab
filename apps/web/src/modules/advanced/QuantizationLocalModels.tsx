import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { advancedApi, type QuantizationPrecision } from "./api";

const MODELS = ["llama3.1:8b", "mock-large", "gpt-4o-mini", "claude-sonnet-5"];

/** M10: quantization trade-offs (illustrative) + how to actually run a local model via Ollama. */
export function QuantizationLocalModels(): JSX.Element {
  const [model, setModel] = React.useState(MODELS[0]!);
  const [precision, setPrecision] = React.useState<QuantizationPrecision>("fp16");

  const mutation = useMutation({
    mutationFn: () => advancedApi.quantizationDemo({ model, precision }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="quant-model" className="mb-1 block text-xs font-medium">Model</label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="quant-model" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="quant-precision" className="mb-1 block text-xs font-medium">
            <GlossaryTerm id="quantization">Precision</GlossaryTerm>
          </label>
          <Select value={precision} onValueChange={(v) => setPrecision(v as QuantizationPrecision)}>
            <SelectTrigger id="quant-precision" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fp16">fp16</SelectItem>
              <SelectItem value="int8">int8</SelectItem>
              <SelectItem value="int4">int4</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Compute illustrative trade-off</Button>
      </div>

      {mutation.isError && <ErrorState message={(mutation.error as Error).message} />}
      {mutation.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Order-of-magnitude illustration (not a benchmark)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Approx. size</div>
                <div>{mutation.data.approxSizeMb.toFixed(0)} MB</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Approx. latency factor (vs. fp16)</div>
                <div>{mutation.data.approxLatencyFactor.toFixed(2)}x</div>
              </div>
            </div>
            <p className="text-muted-foreground">{mutation.data.qualityNotes}</p>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{mutation.data.note}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Running a local model for real, via Ollama</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This app supports a real local provider when Ollama is reachable: install{" "}
            <a className="underline" href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>, run{" "}
            <code className="rounded bg-muted px-1">ollama pull llama3.1:8b</code>, then{" "}
            <code className="rounded bg-muted px-1">ollama serve</code> (or just run a prompt once with{" "}
            <code className="rounded bg-muted px-1">ollama run llama3.1:8b</code> to confirm it works).
          </p>
          <p>
            Set <code className="rounded bg-muted px-1">OLLAMA_BASE_URL</code> in the API&apos;s environment
            (defaults to <code className="rounded bg-muted px-1">http://localhost:11434</code>) and select the
            Ollama provider in any playground&apos;s provider/model picker - zero cost, fully local
            inference, no API key required. If Ollama is absent, this app still works fully in Mock mode.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

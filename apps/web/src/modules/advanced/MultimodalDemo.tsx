import * as React from "react";
import type { Message } from "@ail/shared";
import { Button, Textarea, Input, Label } from "@/components/ui";
import { ProviderModelSelector } from "@/components/ProviderModelSelector";
import { StreamingRegion } from "@/components/StreamingRegion";
import { useSse } from "@/hooks/useSse";

export interface MultimodalDemoProps {
  onRunComplete: (runId: string) => void;
}

const SAMPLE_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/7/70/Example.png";

/**
 * M10 multimodal demo: image + text message sent through the standard
 * generation stream, gated server-side on the selected model's documented
 * `supportsVision` (422 if unsupported, surfaced below as a plain error).
 * Honest under mock: the mock provider cannot actually "see" the image
 * (no real vision model behind it) - its deterministic reply still
 * reflects the text prompt, demonstrating the message SHAPE (how an image
 * is represented/tokenised as a content block) without pretending to
 * analyze real pixels.
 */
export function MultimodalDemo({ onRunComplete }: MultimodalDemoProps): JSX.Element {
  const [providerId, setProviderId] = React.useState<"anthropic" | "openai" | "ollama" | "mock">("mock");
  const [model, setModel] = React.useState("mock-large");
  const [imageUrl, setImageUrl] = React.useState(SAMPLE_IMAGE_URL);
  const [question, setQuestion] = React.useState("What's in this image?");

  const messages: Message[] = [
    {
      role: "user",
      content: [
        { type: "text", text: question },
        { type: "image", url: imageUrl, mimeType: "image/png" },
      ],
    },
  ];

  const { status, runs, start, error } = useSse("/api/advanced/multimodal-demo", {
    messages,
    providerId,
    model,
  });
  const run = Object.values(runs)[0];

  React.useEffect(() => {
    if (run?.status === "complete" && run.run) onRunComplete(run.run.id);
  }, [run, onRunComplete]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        An image is represented as its own content block (<code>{"{ type: \"image\", url | base64, mimeType }"}</code>)
        alongside text blocks in the same message - this is how multimodal input is structured and
        sent to the provider, independent of whether the selected model can actually process it.
      </p>
      <ProviderModelSelector
        providerId={providerId}
        model={model}
        onChange={(next) => { setProviderId(next.providerId); setModel(next.model); }}
        filter={(m) => m.supportsVision}
      />
      <div className="space-y-1">
        <Label htmlFor="image-url">Image URL</Label>
        <Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="question">Question</Label>
        <Textarea id="question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} />
      </div>
      <Button onClick={start} disabled={status === "connecting" || status === "streaming"}>
        Send
      </Button>

      {error && <p className="text-sm text-destructive" role="alert">{error.message}</p>}

      <StreamingRegion
        text={run?.tokens.join("") ?? ""}
        status={run?.status === "pending" ? "idle" : run?.status ?? "idle"}
        label="Multimodal response"
      />
    </div>
  );
}

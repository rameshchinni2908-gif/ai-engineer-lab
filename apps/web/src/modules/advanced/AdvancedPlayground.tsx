import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { AttentionHeatmap } from "./AttentionHeatmap";
import { QuantizationLocalModels } from "./QuantizationLocalModels";
import { MultimodalDemo } from "./MultimodalDemo";
import { ReasoningBudget } from "./ReasoningBudget";
import { SyntheticDataLab } from "./SyntheticDataLab";

export interface AdvancedPlaygroundProps {
  onRunComplete: (runId: string) => void;
}

export function AdvancedPlayground({ onRunComplete }: AdvancedPlaygroundProps): JSX.Element {
  return (
    <Tabs defaultValue="attention" className="space-y-3">
      <TabsList>
        <TabsTrigger value="attention">Attention heatmap</TabsTrigger>
        <TabsTrigger value="quantization">Quantization &amp; local models</TabsTrigger>
        <TabsTrigger value="multimodal">Multimodal</TabsTrigger>
        <TabsTrigger value="reasoning">Reasoning budgets</TabsTrigger>
        <TabsTrigger value="synthetic">Synthetic data</TabsTrigger>
      </TabsList>
      <TabsContent value="attention"><AttentionHeatmap /></TabsContent>
      <TabsContent value="quantization"><QuantizationLocalModels /></TabsContent>
      <TabsContent value="multimodal"><MultimodalDemo onRunComplete={onRunComplete} /></TabsContent>
      <TabsContent value="reasoning"><ReasoningBudget onRunComplete={onRunComplete} /></TabsContent>
      <TabsContent value="synthetic"><SyntheticDataLab /></TabsContent>
    </Tabs>
  );
}

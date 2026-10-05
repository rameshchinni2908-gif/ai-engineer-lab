import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { CostLab } from "./CostLab";
import { ReliabilityLab } from "./ReliabilityLab";
import { LatencyLab } from "./LatencyLab";

export interface ProductionPlaygroundProps {
  onRunComplete: (runId: string) => void;
}

export function ProductionPlayground({ onRunComplete }: ProductionPlaygroundProps): JSX.Element {
  return (
    <Tabs defaultValue="cost" className="space-y-3">
      <TabsList>
        <TabsTrigger value="cost">Cost lab</TabsTrigger>
        <TabsTrigger value="reliability">Reliability lab</TabsTrigger>
        <TabsTrigger value="latency">Latency lab</TabsTrigger>
      </TabsList>
      <TabsContent value="cost"><CostLab /></TabsContent>
      <TabsContent value="reliability"><ReliabilityLab /></TabsContent>
      <TabsContent value="latency"><LatencyLab onRunComplete={onRunComplete} /></TabsContent>
    </Tabs>
  );
}

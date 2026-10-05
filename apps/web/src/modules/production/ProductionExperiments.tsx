import { TracingDashboard } from "./TracingDashboard";
import { RolloutPlaybook } from "./RolloutPlaybook";

export function ProductionExperiments(): JSX.Element {
  return (
    <div className="space-y-6">
      <TracingDashboard />
      <RolloutPlaybook />
    </div>
  );
}

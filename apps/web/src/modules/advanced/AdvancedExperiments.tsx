import { PretrainSftRlhf } from "./PretrainSftRlhf";
import { AdaptationMatrix } from "./AdaptationMatrix";

export function AdvancedExperiments(): JSX.Element {
  return (
    <div className="space-y-6">
      <PretrainSftRlhf />
      <AdaptationMatrix />
    </div>
  );
}

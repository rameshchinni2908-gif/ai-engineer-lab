import * as React from "react";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { AttackPlayground } from "./AttackPlayground";
import { OwaspMap } from "./OwaspMap";
import { AuditLogView } from "./AuditLogView";
import { SecurityChecklist } from "./SecurityChecklist";

interface SecurityPresetParams {
  attackId?: string;
}

const PRESET_PARAMS: Record<string, SecurityPresetParams> = {
  "security-attack-then-defend": { attackId: "direct-injection-reveal-secret" },
  "security-indirect-via-document": { attackId: "indirect-injection-poisoned-document" },
  "security-owasp-category-tour": { attackId: "markdown-image-exfiltration" },
  "security-audit-log-review": { attackId: "tool-abuse-unauthorized-action" },
};

export default function SecurityModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [presetAttackId, setPresetAttackId] = React.useState<string | undefined>();
  const content = MODULE_CONTENT.security;

  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="security"
      title="Guardrails & Security"
      description="Attack a deliberately vulnerable demo bot, then enable defenses and watch the same attack get blocked."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<SecurityPresetParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => {
            setActivePresetId(p.id);
            setPresetAttackId(p.params?.attackId);
          }}
        />
      }
      playground={<AttackPlayground onRunComplete={setActiveRunId} presetAttackId={presetAttackId} />}
      experiments={
        <div className="space-y-6">
          <OwaspMap />
          <AuditLogView />
        </div>
      }
      pitfalls={
        <div className="space-y-6">
          <PitfallsList pitfalls={content.pitfalls} />
          <SecurityChecklist />
        </div>
      }
      activeRunId={activeRunId}
    />
  );
}

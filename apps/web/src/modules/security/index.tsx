import * as React from "react";
import type { GuardrailConfig } from "@ail/shared";
import { ModuleShell } from "@/components/ModuleShell";
import { PresetPicker } from "@/components/PresetPicker";
import { MODULE_CONTENT } from "@/content";
import { LearnTabContent, PitfallsList } from "./LearnAndPitfalls";
import { AttackPlayground, FALLBACK_CONFIG, type AttackPlaygroundParams } from "./AttackPlayground";
import { OwaspMap } from "./OwaspMap";
import { AuditLogView } from "./AuditLogView";
import { SecurityChecklist } from "./SecurityChecklist";

/** The "after" half of the undefended/defended pair presets below apply - every layer on, tools restricted to the safe subset. Kept local (not imported from the backend) since web/api are separate packages; must stay in sync with `DefenseLayerToggles`'s safe-tool list by convention. */
const FULLY_DEFENDED_CONFIG: GuardrailConfig = {
  inputValidation: true,
  piiRedaction: true,
  injectionClassifier: true,
  instructionHierarchy: true,
  delimiterHardening: true,
  outputModeration: true,
  schemaEnforcement: true,
  toolAllowList: ["read_file", "web_search"],
  leastPrivilege: true,
  sandbox: true,
  rateLimit: true,
  approvalGates: true,
};

/**
 * Zipped onto content-writer's preset copy. Two presets apply the UNDEFENDED
 * config, two apply the FULLY DEFENDED config - an undefended/defended pair
 * the user can click between to see the headline flow in one click each way,
 * instead of twelve manual toggles. `config` is real `GuardrailConfig`
 * intent, so `AttackPlayground` must treat it with the same "user intent
 * wins" precedence as a hand-toggled switch (see `AttackPlayground.tsx`'s
 * `userInteractedRef`).
 */
const PRESET_PARAMS: Record<string, AttackPlaygroundParams> = {
  "security-attack-then-defend": { attackId: "direct-injection-reveal-secret", config: FALLBACK_CONFIG },
  "security-indirect-via-document": { attackId: "indirect-injection-poisoned-document", config: FALLBACK_CONFIG },
  "security-owasp-category-tour": { attackId: "markdown-image-exfiltration", config: FULLY_DEFENDED_CONFIG },
  "security-audit-log-review": { attackId: "tool-abuse-unauthorized-action", config: FULLY_DEFENDED_CONFIG },
};

export default function SecurityModulePage(): JSX.Element {
  const [activeRunId, setActiveRunId] = React.useState<string | undefined>();
  const [activePresetId, setActivePresetId] = React.useState<string | undefined>();
  const [appliedParams, setAppliedParams] = React.useState<AttackPlaygroundParams | undefined>();
  const content = MODULE_CONTENT.security;

  const presets = content.presets.map((p) => ({ ...p, params: PRESET_PARAMS[p.id] }));

  return (
    <ModuleShell
      moduleId="security"
      title="Guardrails & Security"
      description="Attack a deliberately vulnerable demo bot, then enable defenses and watch the same attack get blocked."
      learn={<LearnTabContent content={content.learn} />}
      presets={
        <PresetPicker<AttackPlaygroundParams>
          presets={presets}
          activeId={activePresetId}
          onSelect={(p) => {
            setActivePresetId(p.id);
            setAppliedParams(p.params);
          }}
        />
      }
      playground={<AttackPlayground onRunComplete={setActiveRunId} appliedParams={appliedParams} />}
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

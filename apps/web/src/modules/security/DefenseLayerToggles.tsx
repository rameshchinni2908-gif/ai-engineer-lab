import type { GuardrailConfig, GuardrailLayer } from "@ail/shared";
import { Button, Label, Switch } from "@/components/ui";

const SAFE_TOOLS = ["read_file", "web_search"];
const OPEN_TOOLS = ["send_email", "read_file", "execute_code", "web_search"];

const BOOLEAN_LAYERS: { key: Exclude<GuardrailLayer, "toolAllowList">; label: string; hint: string }[] = [
  { key: "inputValidation", label: "Input validation", hint: "Rejects control chars, zero-width chars, excessive length." },
  { key: "piiRedaction", label: "PII redaction", hint: "Redacts emails, phones, SSNs, API-key-like tokens." },
  { key: "injectionClassifier", label: "Injection classifier", hint: "Blocks known injection/jailbreak trigger phrases." },
  { key: "instructionHierarchy", label: "Instruction hierarchy", hint: "Never treats retrieved/tool content as instructions." },
  { key: "delimiterHardening", label: "Delimiter hardening", hint: "Blocks attempts to break out of data delimiters." },
  { key: "outputModeration", label: "Output moderation", hint: "Redacts/blocks leaked secrets and exfil markdown." },
  { key: "schemaEnforcement", label: "Schema enforcement", hint: "Rejects malformed tool-call arguments." },
  { key: "leastPrivilege", label: "Least privilege", hint: "Constrains even allow-listed tools' arguments." },
  { key: "sandbox", label: "Sandbox", hint: "Blocks code trying to escape the isolated sandbox." },
  { key: "rateLimit", label: "Rate limit", hint: "Caps request bursts per session." },
  { key: "approvalGates", label: "Approval gates", hint: "Holds dangerous tool calls for human approval." },
];

export interface DefenseLayerTogglesProps {
  config: GuardrailConfig;
  onChange: (config: GuardrailConfig) => void;
}

/** All twelve `GuardrailConfig` layers, toggleable. `toolAllowList` is an array, not a boolean, so it gets its own restricted/open switch. */
export function DefenseLayerToggles({ config, onChange }: DefenseLayerTogglesProps): JSX.Element {
  const toolAllowListRestricted = config.toolAllowList.length < OPEN_TOOLS.length;

  function setLayer(key: Exclude<GuardrailLayer, "toolAllowList">, value: boolean): void {
    onChange({ ...config, [key]: value });
  }

  function setAllDefenses(on: boolean): void {
    const next: GuardrailConfig = { ...config };
    for (const layer of BOOLEAN_LAYERS) next[layer.key] = on;
    next.toolAllowList = on ? SAFE_TOOLS : OPEN_TOOLS;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setAllDefenses(false)}>
          Disable all (undefended)
        </Button>
        <Button type="button" size="sm" onClick={() => setAllDefenses(true)}>
          Enable all (fully defended)
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {BOOLEAN_LAYERS.map((layer) => (
          <div key={layer.key} className="flex items-start gap-2 rounded-md border border-border p-2">
            <Switch
              id={`layer-${layer.key}`}
              checked={config[layer.key] as boolean}
              onCheckedChange={(checked) => setLayer(layer.key, checked)}
            />
            <div>
              <Label htmlFor={`layer-${layer.key}`} className="text-sm font-medium">
                {layer.label}
              </Label>
              <p className="text-xs text-muted-foreground">{layer.hint}</p>
            </div>
          </div>
        ))}
        <div className="flex items-start gap-2 rounded-md border border-border p-2">
          <Switch
            id="layer-toolAllowList"
            checked={toolAllowListRestricted}
            onCheckedChange={(checked) => onChange({ ...config, toolAllowList: checked ? SAFE_TOOLS : OPEN_TOOLS })}
          />
          <div>
            <Label htmlFor="layer-toolAllowList" className="text-sm font-medium">
              Tool allow-list
            </Label>
            <p className="text-xs text-muted-foreground">
              {toolAllowListRestricted
                ? `Restricted to: ${config.toolAllowList.join(", ")}`
                : "Open: all tools allowed (send_email, read_file, execute_code, web_search)."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

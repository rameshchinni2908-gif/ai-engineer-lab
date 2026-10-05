import { ATTACK_CATALOG } from "./attacks.js";

export interface OwaspMapping {
  owaspId: string;
  title: string;
  attackIds: string[];
}

const TITLES: { owaspId: string; title: string }[] = [
  { owaspId: "LLM01", title: "Prompt Injection" },
  { owaspId: "LLM02", title: "Insecure Output Handling" },
  { owaspId: "LLM03", title: "Training Data Poisoning" },
  { owaspId: "LLM04", title: "Model Denial of Service" },
  { owaspId: "LLM05", title: "Supply Chain Vulnerabilities" },
  { owaspId: "LLM06", title: "Sensitive Information Disclosure" },
  { owaspId: "LLM07", title: "Insecure Plugin Design" },
  { owaspId: "LLM08", title: "Excessive Agency" },
  { owaspId: "LLM09", title: "Overreliance" },
  { owaspId: "LLM10", title: "Model Theft" },
];

/** `GET /guardrails/owasp-map`: the full OWASP LLM Top 10 list, with `attackIds` populated for the categories this module actually demos. */
export function buildOwaspMap(): OwaspMapping[] {
  return TITLES.map(({ owaspId, title }) => ({
    owaspId,
    title,
    attackIds: ATTACK_CATALOG.filter((a) => a.owaspId === owaspId).map((a) => a.id),
  }));
}

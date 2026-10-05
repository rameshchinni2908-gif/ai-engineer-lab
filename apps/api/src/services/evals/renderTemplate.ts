/** Minimal `{{variable}}` template renderer for turning an EvalCase's `input` fields into a prompt string. Pure, unit-tested. */
export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined) return match; // leave unresolved placeholders visible rather than silently dropping them
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

/**
 * Deterministically derives plausible arguments for a tool from the agent's
 * goal text, so every runtime can pick "what to call" without depending on
 * the mock provider's own (hash-based, always-wants-a-tool-when-offered-one)
 * tool-call selection - keeping step counts/content fully predictable for
 * teaching and for the security/control tests.
 */
export function argsForTool(name: string, goal: string): unknown {
  switch (name) {
    case "calculator": {
      const match = goal.match(/-?\d+(\.\d+)?(\s*[-+*/]\s*-?\d+(\.\d+)?)+/);
      return { expression: match ? match[0] : "2 + 2" };
    }
    case "web_search":
    case "vector_search":
      return { query: goal, topK: 3 };
    case "file_reader":
      return { path: "notes.md" };
    case "code_sandbox":
      return { code: "console.log(2 + 2);" };
    case "http_fetch":
      return { url: "https://docs.ail-example.com/intro" };
    default:
      return { query: goal };
  }
}

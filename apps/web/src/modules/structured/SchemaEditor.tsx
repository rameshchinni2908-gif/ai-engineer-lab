import * as React from "react";
import Editor from "@monaco-editor/react";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label } from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { validateJson } from "./api";

const DEFAULT_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      age: { type: "integer", minimum: 0, maximum: 150 },
      role: { type: "string", enum: ["admin", "user"] },
    },
    required: ["name", "age"],
    additionalProperties: false,
  },
  null,
  2,
);

const DEFAULT_JSON = JSON.stringify({ name: "Ada", age: 200, extra: "oops" }, null, 2);

/** M3 schema editor: Monaco-edited JSON Schema + candidate JSON, with live per-field validation. */
export function SchemaEditor(): JSX.Element {
  const [schemaText, setSchemaText] = React.useState(DEFAULT_SCHEMA);
  const [jsonText, setJsonText] = React.useState(DEFAULT_JSON);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let schema: unknown;
      let json: unknown;
      try {
        schema = JSON.parse(schemaText);
      } catch (e) {
        throw new Error(`Schema is not valid JSON: ${(e as Error).message}`);
      }
      try {
        json = JSON.parse(jsonText);
      } catch (e) {
        throw new Error(`Candidate JSON is not valid JSON: ${(e as Error).message}`);
      }
      setParseError(null);
      return validateJson(json, schema);
    },
    onError: (e: Error) => setParseError(e.message),
  });

  const result = mutation.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schema editor + live validation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label>JSON Schema</Label>
            <div className="mt-1 overflow-hidden rounded-md border border-border">
              <Editor
                height="220px"
                language="json"
                theme="vs-dark"
                value={schemaText}
                onChange={(v) => setSchemaText(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12 }}
              />
            </div>
          </div>
          <div>
            <Label>Candidate JSON output</Label>
            <div className="mt-1 overflow-hidden rounded-md border border-border">
              <Editor
                height="220px"
                language="json"
                theme="vs-dark"
                value={jsonText}
                onChange={(v) => setJsonText(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12 }}
              />
            </div>
          </div>
        </div>

        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          Validate
        </Button>

        {parseError && <ErrorState message={parseError} />}

        {result && (
          <div className="space-y-2">
            <Badge variant={result.valid ? "success" : "destructive"}>{result.valid ? "valid" : "invalid"}</Badge>
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-sm">
                {result.errors.map((e, i) => (
                  <li key={i} className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                    <span className="font-mono text-xs font-semibold">{e.path || "$"}</span>: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import * as React from "react";
import { DESIGN_SCENARIOS } from "@/content";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { ArchitectureDiagram } from "./ArchitectureDiagram";

/**
 * M11 system-design scenarios: render the brief/requirements/constraints
 * first so the learner thinks it through, THEN reveal the reference
 * architecture (readable node/edge diagram) plus key decisions, trade-offs,
 * and rubric from the real `DESIGN_SCENARIOS` content.
 */
export function DesignScenarios(): JSX.Element {
  const [scenarioId, setScenarioId] = React.useState(DESIGN_SCENARIOS[0]!.id);
  const [revealed, setRevealed] = React.useState(false);
  const scenario = DESIGN_SCENARIOS.find((s) => s.id === scenarioId)!;

  function selectScenario(id: string): void {
    setScenarioId(id);
    setRevealed(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="scenario-select" className="mb-1 block text-xs font-medium">Scenario</label>
        <Select value={scenarioId} onValueChange={selectScenario}>
          <SelectTrigger id="scenario-select" className="w-full sm:w-96"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DESIGN_SCENARIOS.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{scenario.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{scenario.brief}</p>
          <div>
            <h4 className="mb-1 font-semibold">Requirements</h4>
            <ul className="list-inside list-disc text-muted-foreground">
              {scenario.requirements.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 font-semibold">Constraints</h4>
            <ul className="list-inside list-disc text-muted-foreground">
              {scenario.constraints.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
          <div className="flex flex-wrap gap-1">
            {scenario.relatedModules.map((m) => <Badge key={m} variant="outline">{m}</Badge>)}
          </div>
        </CardContent>
      </Card>

      {!revealed ? (
        <Button onClick={() => setRevealed(true)}>
          Think it through, then reveal the reference architecture
        </Button>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reference architecture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{scenario.referenceArchitecture.summary}</p>
              <ArchitectureDiagram
                nodes={scenario.referenceArchitecture.nodes}
                edges={scenario.referenceArchitecture.edges}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Key decisions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {scenario.keyDecisions.map((d, i) => (
                <div key={i} className="rounded-md border border-border p-2">
                  <div className="font-medium">{d.decision}</div>
                  <div className="text-xs text-muted-foreground">Options: {d.options.join(" · ")}</div>
                  <div className="mt-1"><span className="font-medium">Recommendation:</span> {d.recommendation}</div>
                  <div className="text-muted-foreground">{d.rationale}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Trade-offs</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {scenario.tradeoffs.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rubric</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criterion</TableHead>
                    <TableHead>Good</TableHead>
                    <TableHead>Bad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenario.rubric.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.criterion}</TableCell>
                      <TableCell className="text-emerald-700 dark:text-emerald-400">{r.good}</TableCell>
                      <TableCell className="text-destructive">{r.bad}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

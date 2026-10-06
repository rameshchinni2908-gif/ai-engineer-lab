import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ModuleId } from "@ail/shared";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { RunInspector } from "@/components/RunInspector";
import { WhyThisHappened } from "@/components/WhyThisHappened";
import { EmptyState } from "@/components/EmptyState";
import { useUiStore } from "@/stores/ui";
import { useProgressStore, type ModuleTab } from "@/stores/progress";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const TABS: { id: ModuleTab; label: string }[] = [
  { id: "learn", label: "Learn" },
  { id: "playground", label: "Playground" },
  { id: "experiments", label: "Experiments" },
  { id: "pitfalls", label: "Pitfalls" },
];

export interface ModuleShellProps {
  moduleId: ModuleId;
  title: string;
  description?: string;
  /** Left pane content (collapsible). Plain-language explain / under-the-hood / senior gotchas. */
  learn: React.ReactNode;
  /** Center pane content for the Playground tab. Put `<PresetPicker>` inside this (or use `presets`). */
  playground: React.ReactNode;
  /** Center content for the Experiments tab (e.g. side-by-side runs, eval sweeps). */
  experiments?: React.ReactNode;
  /** Center content for the Pitfalls tab. */
  pitfalls?: React.ReactNode;
  /** Rendered above `playground`, inside the Playground tab - typically a `<PresetPicker>`. */
  presets?: React.ReactNode;
  /**
   * The run id currently relevant to the right pane. Set this from your
   * playground's state once a run starts/completes (e.g. from `useSse`'s
   * `run_complete` event or after a non-streaming call). Omit while idle -
   * the right pane shows an empty state instead of guessing.
   */
  activeRunId?: string;
  /** Extra content appended below the standard Run Inspector + Why This Happened pane (e.g. an agent step trace). */
  rightPaneExtra?: React.ReactNode;
}

/**
 * The three-region layout every module page composes (CLAUDE.md): left =
 * Learn (collapsible), center = Playground/Experiments/Pitfalls (tabbed,
 * tab synced to the URL as `/m/:moduleId/:tab`), right = Run Inspector +
 * "Why this happened". Responsive: stacks vertically below the `lg`
 * breakpoint, with the right pane becoming a drawer dialog.
 *
 * Module agents (Wave 2): compose this ONCE per module page, passing your
 * Learn/Playground/Experiments/Pitfalls content as props. Do not fork or
 * restyle this component - request a change from frontend-shell instead.
 */
export function ModuleShell({
  moduleId,
  title,
  description,
  learn,
  playground,
  experiments,
  pitfalls,
  presets,
  activeRunId,
  rightPaneExtra,
}: ModuleShellProps): JSX.Element {
  const params = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const isWide = useMediaQuery("(min-width: 1024px)");

  const learnCollapsed = useUiStore((s) => s.learnPaneCollapsed);
  const toggleLearnPane = useUiStore((s) => s.toggleLearnPane);
  const inspectorCollapsed = useUiStore((s) => s.inspectorCollapsed);
  const toggleInspector = useUiStore((s) => s.toggleInspector);
  const markVisited = useProgressStore((s) => s.markVisited);

  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const activeTab: ModuleTab = TABS.some((t) => t.id === params.tab) ? (params.tab as ModuleTab) : "learn";

  React.useEffect(() => {
    markVisited(moduleId, activeTab);
  }, [moduleId, activeTab, markVisited]);

  const handleTabChange = (value: string): void => {
    navigate(`/m/${moduleId}/${value}`);
  };

  const rightPane = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <section aria-label="Run Inspector">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Run Inspector</h2>
        <RunInspector runId={activeRunId} />
      </section>
      <section aria-label="Why this happened">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Why this happened
        </h2>
        <WhyThisHappened runId={activeRunId} />
      </section>
      {rightPaneExtra}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <TabsList aria-label={`${title} sections`}>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {!isWide && (
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)} aria-label="Open Run Inspector">
              <PanelRightOpen className="mr-1 h-4 w-4" aria-hidden="true" />
              Inspector
            </Button>
          )}
        </div>

        <div
          data-testid="module-shell-row"
          className={cn(
            "mt-3 min-h-0 flex-1 gap-4",
            isWide ? "grid grid-cols-[minmax(0,320px)_1fr_minmax(0,360px)]" : "flex flex-col",
          )}
        >
          {/* Learn pane: persistent collapsible column on wide screens; folds into the Learn tab on narrow screens. */}
          {isWide && (
            <aside
              aria-label="Learn"
              className={cn("shrink-0 overflow-y-auto rounded-lg border border-border", learnCollapsed && "w-12")}
            >
              <div className="flex items-center justify-between border-b border-border p-2">
                {!learnCollapsed && <span className="text-sm font-semibold">Learn</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleLearnPane}
                  aria-label={learnCollapsed ? "Expand Learn pane" : "Collapse Learn pane"}
                  aria-expanded={!learnCollapsed}
                >
                  {learnCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              {!learnCollapsed && <div className="p-3">{learn}</div>}
            </aside>
          )}

          {/* Center: tab content. overflow-x-hidden is the hard guarantee that no
              playground control (e.g. a long-labeled select/button a module forgets
              to constrain) can ever paint past this track and over the right aside -
              min-w-0 alone only stops *this* element from blowing out the grid track;
              it does not clip a misbehaving descendant that's wider than the track. */}
          <div data-testid="module-shell-center" className="min-h-0 min-w-0 overflow-x-hidden">
            <TabsContent value="learn" className="h-full">
              {isWide ? (
                <EmptyState
                  title="Learn is in the left pane"
                  description="Expand it with the panel toggle if you collapsed it."
                />
              ) : (
                learn
              )}
            </TabsContent>
            <TabsContent value="playground" className="h-full space-y-4">
              {presets}
              {playground}
            </TabsContent>
            <TabsContent value="experiments" className="h-full">
              {experiments ?? (
                <EmptyState title="No experiments yet" description="This module hasn't added experiments." />
              )}
            </TabsContent>
            <TabsContent value="pitfalls" className="h-full">
              {pitfalls ?? <EmptyState title="No pitfalls documented yet" />}
            </TabsContent>
          </div>

          {/* Right: Run Inspector + Why This Happened (wide screens only; drawer below) */}
          {isWide && (
            <aside
              aria-label="Run Inspector and explanation"
              className={cn("shrink-0 overflow-y-auto rounded-lg border border-border p-3", inspectorCollapsed && "w-12 p-2")}
            >
              <div className="mb-2 flex items-center justify-between">
                {!inspectorCollapsed && <span className="text-sm font-semibold">Inspector</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleInspector}
                  aria-label={inspectorCollapsed ? "Expand Inspector pane" : "Collapse Inspector pane"}
                  aria-expanded={!inspectorCollapsed}
                >
                  {inspectorCollapsed ? (
                    <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <PanelRightClose className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              {!inspectorCollapsed && rightPane}
            </aside>
          )}
        </div>
      </Tabs>

      {!isWide && (
        <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Run Inspector</DialogTitle>
            </DialogHeader>
            {rightPane}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

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
 * breakpoint, with document scrolling and the right pane in a dialog.
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

  // Content of the Run Inspector + Why This Happened pane. Deliberately has no
  // height/overflow classes of its own: whichever ancestor hosts it (the wide
  // persistent aside below, or the mobile drawer's <DialogContent>) is the one
  // scroll owner for this content. Nesting a second `overflow-y-auto` directly
  // inside an already-scrolling aside produced two independent scroll boxes of
  // identical size - functionally harmless here, but exactly the kind of
  // "scroller inside a scroller" shape that causes wheel-chaining jank, so it
  // is avoided on principle everywhere in this component.
  const rightPane = (
    <div className="flex flex-col gap-5">
      <section aria-label="Run Inspector">
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run Inspector</h2>
        <RunInspector runId={activeRunId} />
      </section>
      <section aria-label="Why this happened">
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Why this happened
        </h2>
        <WhyThisHappened runId={activeRunId} />
      </section>
      {rightPaneExtra}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-col lg:h-full">
        <div className="shrink-0">
          <header>
            <div className="flex items-start justify-between gap-2">
              <h1 className="min-w-0 break-words text-xl font-bold sm:text-2xl">{title}</h1>
              {!isWide && (
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => setDrawerOpen(true)} aria-label="Open Run Inspector" title="Run Inspector">
                  <PanelRightOpen className="h-5 w-5" aria-hidden="true" />
                </Button>
              )}
            </div>
            {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
          </header>

          <div className="mt-3 flex items-center justify-between gap-2">
            <TabsList className="grid h-auto min-h-11 w-full grid-cols-4 sm:inline-flex sm:w-auto" aria-label={`${title} sections`}>
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="min-h-9 min-w-0 px-1 text-xs sm:px-3 sm:text-sm">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        {/* Desktop panes scroll independently; mobile content flows into
            the document so browser bars can expand and collapse naturally. */}
        <div
          data-testid="module-shell-row"
          className={cn(
            "mt-3 min-h-0 min-w-0 gap-4 lg:flex-1",
            isWide ? "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]" : "flex flex-col",
          )}
          style={isWide ? { gridTemplateColumns: `${learnCollapsed ? "3rem" : "minmax(0,1fr)"} minmax(0,2fr) ${inspectorCollapsed ? "3rem" : "minmax(0,1fr)"}` } : undefined}
        >
          {/* Learn pane: persistent collapsible column on wide screens; folds into
              the Learn tab on narrow screens. Recessed `bg-muted/30` (no border)
              against the white/card center column so the eye finds the
              Playground first - fewer nested bordered boxes than before. */}
          {isWide && (
            <aside
              aria-label="Learn"
              className={cn(
                "min-h-0 overflow-y-auto overscroll-contain rounded-lg bg-muted/30",
                learnCollapsed && "w-12",
              )}
            >
              <div className="flex items-center justify-between p-2">
                {!learnCollapsed && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Learn</span>
                )}
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
              {!learnCollapsed && <div className="px-3 pb-3">{learn}</div>}
            </aside>
          )}

          {/* Center: tab content. `min-w-0` + `overflow-x-hidden` is the hard
              guarantee that no playground control (e.g. a long-labeled
              select/button a module forgets to constrain) can ever paint past
              this track and over the right aside - `min-w-0` alone only stops
              *this* element from blowing out the grid track; it does not clip
              a misbehaving descendant that's wider than the track. On wide
              screens this is ALSO the pane's independent vertical scroll
              region; on narrow screens it stays a plain block so the page
              scrolls as one stacked column instead of fighting an inner box. */}
          <div
            data-testid="module-shell-center"
            className={cn(
              "min-h-0 min-w-0",
              isWide && "overflow-x-hidden overflow-y-auto overscroll-contain",
            )}
          >
            <TabsContent value="learn" className="lg:h-full">
              {isWide ? (
                <EmptyState
                  title="Learn is in the left pane"
                  description="Expand it with the panel toggle if you collapsed it."
                />
              ) : (
                learn
              )}
            </TabsContent>
            <TabsContent value="playground" className="space-y-4 lg:h-full">
              {presets}
              {playground}
            </TabsContent>
            <TabsContent value="experiments" className="lg:h-full">
              {experiments ?? (
                <EmptyState title="No experiments yet" description="This module hasn't added experiments." />
              )}
            </TabsContent>
            <TabsContent value="pitfalls" className="lg:h-full">
              {pitfalls ?? <EmptyState title="No pitfalls documented yet" />}
            </TabsContent>
          </div>

          {/* Right: Run Inspector + Why This Happened (wide screens only; drawer below).
              Same recessed `bg-muted/30` treatment as the Learn pane, no border -
              both side panes read as quiet supporting surfaces, center stays the
              focal (card/background) surface. */}
          {isWide && (
            <aside
              aria-label="Run Inspector and explanation"
              className={cn(
                "min-h-0 overflow-y-auto overscroll-contain rounded-lg bg-muted/30 p-3",
                inspectorCollapsed && "w-12 p-2",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                {!inspectorCollapsed && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Inspector
                  </span>
                )}
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
          <DialogContent className="max-w-lg" aria-describedby={undefined}>
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

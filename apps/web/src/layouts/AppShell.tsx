import * as React from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { HelpCircle, Menu } from "lucide-react";
import { MODULE_NAV } from "@/app/modules.config";
import { DifficultyToggle } from "@/components/DifficultyToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { SkipToContent } from "@/components/SkipToContent";
import { Toaster, Button, Progress, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { useProgressStore } from "@/stores/progress";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUiStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

function ModuleNavList({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const moduleCompletionRatio = useProgressStore((s) => s.moduleCompletionRatio);
  return (
    <ul className="space-y-1">
      {MODULE_NAV.map((mod) => {
        const ratio = moduleCompletionRatio(mod.id);
        return (
          <li key={mod.id}>
            <NavLink
              to={`/m/${mod.id}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex flex-col gap-1 rounded-md border-l-2 px-3 py-2 text-sm transition-colors motion-reduce:transition-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "border-primary bg-accent text-accent-foreground font-medium"
                    : "border-transparent hover:bg-muted",
                )
              }
            >
              <span className="flex items-start gap-2">
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {String(mod.order).padStart(2, "0")}.
                </span>{" "}
                <span className="min-w-0 break-words">{mod.title}</span>
              </span>
              {ratio > 0 ? (
                <Progress
                  value={ratio * 100}
                  aria-label={`${mod.title} progress: ${Math.round(ratio * 100)}%`}
                  className="h-1"
                />
              ) : (
                // Nothing in progress yet: a 0%-filled track reads as a stray
                // divider line, so don't render it visually. Keep the same
                // information available to assistive tech via an sr-only node.
                <span className="sr-only">{`${mod.title} progress: 0%`}</span>
              )}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Root application chrome: skip link, header (branding, difficulty toggle,
 * theme toggle, shortcuts help), left module nav (11 modules, active state,
 * progress indicators, fully keyboard-navigable via native `<a>` semantics),
 * and the routed page content. Mounted once from `app/router.tsx`.
 */
export function AppShell(): JSX.Element {
  useGlobalKeyboardShortcuts();
  const setShortcutsDialogOpen = useUiStore((s) => s.setShortcutsDialogOpen);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    // The app shell owns the viewport; the document itself never scrolls.
    // `h-dvh` (with `h-screen` as a same-value fallback for browsers that
    // don't support dvh) excludes the mobile URL bar from the height
    // calculation so nothing is ever cut off beneath it.
    <div className="flex h-screen h-dvh flex-col overflow-hidden">
      <SkipToContent />

      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open module navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Link
            to="/"
            className="rounded-sm font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            AI Engineer Lab
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <DifficultyToggle />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => setShortcutsDialogOpen(true)}
          >
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Modules"
          className="hidden w-64 shrink-0 overflow-y-auto border-r border-border p-3 md:block"
        >
          <ModuleNavList />
        </nav>

        {/*
         * Bounded, scrollable box per the contract with ModuleShell: on
         * module pages ModuleShell renders `h-full min-h-0` in here and
         * owns its own internal pane scrolling, so <main> itself does not
         * overflow. Simple pages (e.g. home) scroll inside <main> normally.
         */}
        <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 focus:outline-none">
          <Outlet />
        </main>
      </div>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Modules</DialogTitle>
          </DialogHeader>
          <nav aria-label="Modules (mobile)">
            <ModuleNavList onNavigate={() => setMobileNavOpen(false)} />
          </nav>
        </DialogContent>
      </Dialog>

      <CommandPalette />
      <KeyboardShortcutsDialog />
      <Toaster />
    </div>
  );
}

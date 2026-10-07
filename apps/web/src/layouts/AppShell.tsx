import * as React from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
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
import { InstallAppButton } from "@/components/InstallAppButton";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";

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
  useVisualViewport();
  const setShortcutsDialogOpen = useUiStore((s) => s.setShortcutsDialogOpen);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const { pathname } = useLocation();

  React.useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const main = document.getElementById("main-content");
    if (main) main.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="app-shell flex flex-col">
      <SkipToContent />

      <header className="app-header flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-border bg-background px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open module navigation"
            title="Modules"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Link
            to="/"
            className="rounded-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            AI Engineer Lab
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:order-last sm:gap-2">
          <InstallAppButton />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => setShortcutsDialogOpen(true)}
          >
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <DifficultyToggle className="order-last w-full sm:order-none sm:ml-auto sm:w-auto" />
      </header>

      <AppUpdateNotice />

      <div className="flex min-h-0 min-w-0 flex-1">
        <nav
          aria-label="Modules"
          className="app-sidebar hidden w-56 shrink-0 border-r border-border p-3 md:block xl:w-64"
        >
          <ModuleNavList />
          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <Link to="/glossary" className="block rounded-md px-3 py-2 hover:bg-muted">Glossary</Link>
            <Link to="/runs" className="block rounded-md px-3 py-2 hover:bg-muted">Run history</Link>
          </div>
        </nav>

        <main id="main-content" tabIndex={-1} className="app-main min-h-0 min-w-0 flex-1 p-3 focus:outline-none sm:p-4">
          <Outlet />
        </main>
      </div>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Modules</DialogTitle>
          </DialogHeader>
          <nav aria-label="Modules (mobile)">
            <ul className="mb-2 border-b pb-2">
              <li><Link to="/" className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-muted" onClick={() => setMobileNavOpen(false)}>All modules</Link></li>
            </ul>
            <ModuleNavList onNavigate={() => setMobileNavOpen(false)} />
            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <Link to="/glossary" className="flex min-h-11 items-center rounded-md px-3 hover:bg-muted" onClick={() => setMobileNavOpen(false)}>Glossary</Link>
              <Link to="/runs" className="flex min-h-11 items-center rounded-md px-3 hover:bg-muted" onClick={() => setMobileNavOpen(false)}>Run history</Link>
            </div>
          </nav>
        </DialogContent>
      </Dialog>

      <CommandPalette />
      <KeyboardShortcutsDialog />
      <Toaster />
    </div>
  );
}

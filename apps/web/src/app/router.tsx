import * as React from "react";
import { createBrowserRouter, useParams } from "react-router-dom";
import { ModuleIdSchema, type ModuleId } from "@ail/shared";
import { AppShell } from "@/layouts/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui";
import { MODULE_NAV } from "@/app/modules.config";
import HomePage from "@/pages/HomePage";
import RunsPage from "@/pages/RunsPage";
import NotFoundPage from "@/pages/NotFoundPage";

// Lazy (not eager) specifically so this router's own module graph doesn't
// hard-depend on `@/content` (owned by content-writer, landing in
// parallel) - keeps `/`, `/runs`, and the per-module placeholder route
// independently testable/buildable regardless of content-writer's timing.
const GlossaryPage = React.lazy(() => import("@/pages/GlossaryPage"));

/**
 * §9.2 of docs/contracts.md: each module-owning agent creates
 * `apps/web/src/modules/<moduleId>/index.tsx` (default export = page
 * component). This file is written ONCE in Wave 1 and never touched again
 * in Wave 2 - module agents never edit this router.
 *
 * `import.meta.glob` (not 11 hand-written literal `import("@/modules/x")`
 * specifiers) is deliberate: Vite statically resolves literal dynamic
 * import specifiers at BUILD time and fails the build outright if the
 * target file doesn't exist yet. `import.meta.glob` only matches files that
 * are actually present on disk, so `pnpm build` succeeds with zero files
 * under `src/modules/` (Wave 1 state) and picks up each module's chunk
 * automatically, independently, as Wave 2 agents land - with no router
 * edit required either way. Each matched file still gets its own
 * code-split chunk and its own cached `React.lazy` component, so this is
 * functionally "one lazy import per module," just resolved via a glob
 * instead of 11 copy-pasted literals that would be unsafe to ship today.
 */
const moduleLoaders = import.meta.glob<{ default: React.ComponentType }>("/src/modules/*/index.tsx");

const lazyModuleCache = new Map<ModuleId, React.LazyExoticComponent<React.ComponentType>>();

function getLazyModule(moduleId: ModuleId): React.LazyExoticComponent<React.ComponentType> | null {
  const loader = moduleLoaders[`/src/modules/${moduleId}/index.tsx`];
  if (!loader) return null;

  let cached = lazyModuleCache.get(moduleId);
  if (!cached) {
    cached = React.lazy(loader);
    lazyModuleCache.set(moduleId, cached);
  }
  return cached;
}

function ModulePlaceholder({ moduleId }: { moduleId: ModuleId }): JSX.Element {
  const nav = MODULE_NAV.find((m) => m.id === moduleId);
  return (
    <EmptyState
      title={`${nav?.title ?? moduleId} is coming in a later wave`}
      description="This module's Learn/Playground/Experiments/Pitfalls content hasn't landed yet. Check back soon, or pick another module from the nav."
    />
  );
}

function ModuleLoadingSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

/**
 * Matches `/m/:moduleId` and `/m/:moduleId/:tab`; resolves + renders that
 * module's lazy page. Exported (not just used inline below) so tests can
 * mount it directly inside a `MemoryRouter` without pulling in the rest of
 * `<AppShell>`.
 */
export function ModuleRoute(): JSX.Element {
  const { moduleId: rawModuleId } = useParams<{ moduleId: string }>();
  const parsed = ModuleIdSchema.safeParse(rawModuleId);

  if (!parsed.success) {
    return <NotFoundPage />;
  }

  const moduleId = parsed.data;
  const LazyModule = getLazyModule(moduleId);

  if (!LazyModule) {
    return <ModulePlaceholder moduleId={moduleId} />;
  }

  return (
    <ErrorBoundary
      fallback={() => <ModulePlaceholder moduleId={moduleId} />}
      onError={(error) => {
        if (import.meta.env.DEV) {
          console.error(`[modules/${moduleId}] failed to render:`, error);
        }
      }}
    >
      <React.Suspense fallback={<ModuleLoadingSkeleton />}>
        <LazyModule />
      </React.Suspense>
    </ErrorBoundary>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "m/:moduleId", element: <ModuleRoute /> },
      { path: "m/:moduleId/:tab", element: <ModuleRoute /> },
      {
        path: "glossary",
        element: (
          <React.Suspense fallback={<ModuleLoadingSkeleton />}>
            <GlossaryPage />
          </React.Suspense>
        ),
      },
      { path: "runs", element: <RunsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

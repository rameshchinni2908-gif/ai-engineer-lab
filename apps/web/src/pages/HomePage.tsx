import { MODULE_NAV } from "@/content/modules";

/**
 * Wave 0 placeholder home page: lists the 11 modules so routing/build can be
 * verified end-to-end. frontend-shell (Wave 1) replaces this with the real
 * nav + <ModuleShell> layout.
 */
export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">AI Engineer Lab</h1>
      <p className="mt-2 text-muted-foreground">
        Interactive modern AI engineering lessons for senior engineers. Running in Mock mode
        requires zero API keys.
      </p>
      <ol className="mt-8 space-y-3">
        {MODULE_NAV.map((mod) => (
          <li key={mod.id} className="rounded-lg border border-border p-4">
            <div className="text-sm text-muted-foreground">
              {String(mod.order).padStart(2, "0")}
            </div>
            <div className="text-lg font-semibold">{mod.title}</div>
            <div className="text-sm text-muted-foreground">{mod.shortDescription}</div>
          </li>
        ))}
      </ol>
    </main>
  );
}

import { Link } from "react-router-dom";
import { MODULE_NAV } from "@/app/modules.config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from "@/components/ui";
import { useProgressStore } from "@/stores/progress";

/**
 * App landing page: the 11-module grid. Each card links straight into
 * `<ModuleShell>`'s Learn tab for that module (`/m/:moduleId`).
 */
export default function HomePage(): JSX.Element {
  const moduleCompletionRatio = useProgressStore((s) => s.moduleCompletionRatio);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">AI Engineer Lab</h1>
      <p className="mt-2 text-muted-foreground">
        Interactive modern AI engineering lessons for senior engineers. Runs in Mock mode with zero
        API keys - every module is Explain, Do, and See.
      </p>

      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULE_NAV.map((mod) => {
          const ratio = moduleCompletionRatio(mod.id);
          return (
            <li key={mod.id}>
              <Link
                to={`/m/${mod.id}`}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors hover:border-primary">
                  <CardHeader>
                    <div className="text-xs font-medium text-muted-foreground">
                      {String(mod.order).padStart(2, "0")}
                    </div>
                    <CardTitle>{mod.title}</CardTitle>
                    <CardDescription>{mod.shortDescription}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress
                      value={ratio * 100}
                      aria-label={`${mod.title} progress: ${Math.round(ratio * 100)}%`}
                    />
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

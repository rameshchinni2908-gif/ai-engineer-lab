import * as React from "react";
import { GLOSSARY } from "@/content";
import { Input, Badge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";

/**
 * Full glossary (150+ terms, content-writer owned data). `<GlossaryTerm>`
 * popovers link here via `#<id>` anchors.
 */
export default function GlossaryPage(): JSX.Element {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GLOSSARY;
    return GLOSSARY.filter(
      (t) => t.term.toLowerCase().includes(q) || t.short.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Glossary</h1>
        <p className="mt-1 text-muted-foreground">{GLOSSARY.length} terms across all modules.</p>
      </header>

      <Input
        type="search"
        placeholder="Search terms..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search glossary"
      />

      {filtered.length === 0 ? (
        <EmptyState title="No matching terms" description="Try a different search." />
      ) : (
        <dl className="space-y-6">
          {filtered.map((entry) => (
            <div key={entry.id} id={entry.id} className="scroll-mt-20 border-b border-border pb-4">
              <dt className="flex items-center gap-2 text-lg font-semibold">
                {entry.term}
                {entry.moduleId && <Badge variant="outline">{entry.moduleId}</Badge>}
              </dt>
              <dd className="mt-1 text-sm text-muted-foreground">{entry.short}</dd>
              <dd className="mt-2 text-sm">{entry.long}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

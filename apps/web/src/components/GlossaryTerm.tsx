import * as React from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { GLOSSARY } from "@/content";
import type { GlossaryTerm as GlossaryTermData } from "@/content/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/** `GLOSSARY` indexed by id, computed once at module load. */
const GLOSSARY_BY_ID: Record<string, GlossaryTermData> = Object.fromEntries(
  GLOSSARY.map((entry) => [entry.id, entry]),
);

/** Case-insensitive lookup by the human-readable `term` text, for auto-linking. */
const GLOSSARY_BY_TERM: Map<string, GlossaryTermData> = new Map(
  GLOSSARY.map((entry) => [entry.term.toLowerCase(), entry]),
);

export function getGlossaryTerm(id: string): GlossaryTermData | undefined {
  return GLOSSARY_BY_ID[id];
}

export interface GlossaryTermProps {
  /** Id of a `GlossaryTerm` entry in `@/content`. If unknown, children render as plain text (dev warning only). */
  id: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Inline glossary reference: underlines `children`, shows a keyboard-accessible
 * tooltip with the short definition on hover/focus, and a popover (click/Enter)
 * with the full definition + a link to `/glossary#<id>`.
 *
 * Module agents: wrap any jargon word on first use per CLAUDE.md's glossary
 * requirement, e.g. `<GlossaryTerm id="top-p">top-p</GlossaryTerm>`.
 */
export function GlossaryTerm({ id, children, className }: GlossaryTermProps): JSX.Element {
  const entry = getGlossaryTerm(id);

  if (!entry) {
    if (import.meta.env.DEV) {
      console.warn(`<GlossaryTerm id="${id}"> has no matching entry in GLOSSARY.`);
    }
    return <span className={className}>{children}</span>;
  }

  const triggerClassName = cn(
    "cursor-help underline decoration-dotted decoration-1 underline-offset-2",
    "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button type="button" className={triggerClassName}>
              {children}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{entry.short}</TooltipContent>
      </Tooltip>
      <PopoverContent className="space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          {entry.term}
        </div>
        <p className="text-sm text-muted-foreground">{entry.long}</p>
        <Link
          to={`/glossary#${entry.id}`}
          className="inline-block text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View in glossary &rarr;
        </Link>
      </PopoverContent>
    </Popover>
  );
}

const WORD_BOUNDARY_CACHE = new Map<string, RegExp>();
function termRegex(term: string): RegExp {
  let re = WORD_BOUNDARY_CACHE.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`\\b(${escaped})\\b`, "i");
    WORD_BOUNDARY_CACHE.set(term, re);
  }
  return re;
}

export interface AutoLinkedTextProps {
  text: string;
  className?: string;
}

/**
 * Scans plain text for the FIRST occurrence of each known glossary term and
 * wraps it in `<GlossaryTerm>`, leaving the rest as plain text. Intended for
 * Learn-tab prose where authors don't want to hand-wrap every term.
 * Longer terms are matched first so e.g. "top-p sampling" wins over "top-p".
 */
export function AutoLinkedText({ text, className }: AutoLinkedTextProps): JSX.Element {
  const terms = React.useMemo(
    () => Array.from(GLOSSARY_BY_TERM.values()).sort((a, b) => b.term.length - a.term.length),
    [],
  );

  const nodes = React.useMemo(() => {
    const linked = new Set<string>();
    const segments: (string | { entry: GlossaryTermData; match: string })[] = [text];

    for (const entry of terms) {
      if (linked.has(entry.id)) continue;
      const re = termRegex(entry.term);
      const next: typeof segments = [];
      let found = false;
      for (const segment of segments) {
        if (typeof segment !== "string" || found) {
          next.push(segment);
          continue;
        }
        const match = re.exec(segment);
        if (!match) {
          next.push(segment);
          continue;
        }
        found = true;
        linked.add(entry.id);
        const before = segment.slice(0, match.index);
        const matched = match[0];
        const after = segment.slice(match.index + matched.length);
        if (before) next.push(before);
        next.push({ entry, match: matched });
        if (after) next.push(after);
      }
      segments.length = 0;
      segments.push(...next);
    }

    return segments;
  }, [text, terms]);

  return (
    <span className={className}>
      {nodes.map((node, i) =>
        typeof node === "string" ? (
          <React.Fragment key={i}>{node}</React.Fragment>
        ) : (
          <GlossaryTerm key={i} id={node.entry.id}>
            {node.match}
          </GlossaryTerm>
        ),
      )}
    </span>
  );
}

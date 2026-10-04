import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, Input } from "@/components/ui";
import { MODULE_NAV } from "@/app/modules.config";
import { useUiStore } from "@/stores/ui";

interface Entry {
  id: string;
  label: string;
  path: string;
  hint?: string;
}

const STATIC_ENTRIES: Entry[] = [
  { id: "home", label: "Home", path: "/" },
  { id: "glossary", label: "Glossary", path: "/glossary" },
  { id: "runs", label: "Run history", path: "/runs" },
];

const MODULE_ENTRIES: Entry[] = MODULE_NAV.map((m) => ({
  id: m.id,
  label: m.title,
  path: `/m/${m.id}`,
  hint: m.shortDescription,
}));

const ALL_ENTRIES: Entry[] = [...STATIC_ENTRIES, ...MODULE_ENTRIES];

/**
 * Cmd/Ctrl+K command palette for jumping to any module, the glossary, or run
 * history. Mount once at the app root; opened via `useGlobalKeyboardShortcuts`.
 */
export function CommandPalette(): JSX.Element {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ENTRIES;
    return ALL_ENTRIES.filter(
      (e) => e.label.toLowerCase().includes(q) || e.hint?.toLowerCase().includes(q),
    );
  }, [query]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const go = (entry: Entry): void => {
    navigate(entry.path);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Jump to...</DialogTitle>
        </DialogHeader>
        <div className="p-3">
          <Input
            // No `autoFocus` prop (jsx-a11y disallows it): Radix's <Dialog.Content> already
            // moves focus to the first focusable descendant - this input - when it opens.
            placeholder="Search modules, glossary, run history..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[activeIndex]) {
                e.preventDefault();
                go(results[activeIndex]);
              }
            }}
            aria-label="Search modules, glossary, run history"
            aria-activedescendant={results[activeIndex] ? `command-item-${results[activeIndex].id}` : undefined}
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
          />
        </div>
        <ul id="command-palette-list" role="listbox" className="max-h-80 overflow-y-auto border-t border-border p-2">
          {results.length === 0 && <li className="p-3 text-sm text-muted-foreground">No matches.</li>}
          {results.map((entry, i) => (
            <li key={entry.id} id={`command-item-${entry.id}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onClick={() => go(entry)}
                onMouseEnter={() => setActiveIndex(i)}
                className={
                  "flex w-full flex-col rounded-md px-3 py-2 text-left text-sm focus-visible:outline-none " +
                  (i === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")
                }
              >
                <span className="font-medium">{entry.label}</span>
                {entry.hint && <span className="text-xs text-muted-foreground">{entry.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

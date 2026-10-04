import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui";
import { useUiStore } from "@/stores/ui";

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "Ctrl/Cmd + Enter", description: "Run the current playground action" },
  { keys: "Ctrl/Cmd + Shift + L", description: "Toggle light / dark theme" },
  { keys: "Ctrl/Cmd + I", description: "Toggle the Run Inspector pane" },
  { keys: "Ctrl/Cmd + K", description: "Open the command palette (jump to a module)" },
  { keys: "?", description: "Open this shortcuts help dialog" },
  { keys: "Esc", description: "Close any open dialog/drawer" },
  { keys: "Tab / Shift+Tab", description: "Move focus forward / backward" },
];

/**
 * Discoverable keyboard-shortcuts help dialog, opened via `?` (see
 * `useGlobalKeyboardShortcuts`). Mount once at the app root.
 */
export function KeyboardShortcutsDialog(): JSX.Element {
  const open = useUiStore((s) => s.shortcutsDialogOpen);
  const setOpen = useUiStore((s) => s.setShortcutsDialogOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{s.description}</dt>
              <dd>
                <kbd className="rounded border border-border bg-muted px-2 py-1 font-mono text-xs">{s.keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

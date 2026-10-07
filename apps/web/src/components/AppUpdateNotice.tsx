import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui";

export function AppUpdateNotice(): JSX.Element | null {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const onUpdate = (event: Event): void => {
      const applyUpdate = (event as CustomEvent<() => Promise<void>>).detail;
      setUpdate(() => applyUpdate);
    };
    window.addEventListener("ail-update-ready", onUpdate);
    return () => window.removeEventListener("ail-update-ready", onUpdate);
  }, []);

  if (!update) return null;
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b bg-accent px-3 py-2 text-sm">
      <span>A new version is available.</span>
      <Button variant="outline" size="sm" onClick={() => void update()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Update</Button>
      <Button variant="ghost" size="icon" aria-label="Dismiss update" title="Later" onClick={() => setUpdate(null)}><X className="h-4 w-4" aria-hidden="true" /></Button>
    </div>
  );
}

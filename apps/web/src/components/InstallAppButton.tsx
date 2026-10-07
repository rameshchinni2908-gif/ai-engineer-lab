import { useEffect, useState } from "react";
import { Download, Share, PlusSquare } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton(): JSX.Element | null {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = (): void => setInstalled(displayMode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    updateInstalled();
    setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const onPrompt = (event: Event): void => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = (): void => {
      setInstalled(true);
      setPrompt(null);
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", updateInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", updateInstalled);
    };
  }, []);

  const install = async (): Promise<void> => {
    if (!prompt) {
      setOpen(true);
      return;
    }
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  if (installed) return null;
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Install app" title="Install app" onClick={() => void install()}>
        <Download className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install AI Engineer Lab</DialogTitle>
            <DialogDescription>Add the lab to your home screen.</DialogDescription>
          </DialogHeader>
          {isIos ? (
            <ol className="mt-4 list-inside list-decimal space-y-3 text-sm">
              <li>Tap <Share className="inline h-4 w-4" aria-hidden="true" /> Share in your browser.</li>
              <li>Choose <PlusSquare className="inline h-4 w-4" aria-hidden="true" /> Add to Home Screen.</li>
              <li>Enable Open as Web App if shown, then tap Add.</li>
            </ol>
          ) : (
            <p className="mt-4 text-sm">Open your browser menu and choose Install app or Add to Home Screen. On desktop, use the install icon in the address bar.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

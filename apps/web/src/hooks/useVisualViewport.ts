import { useEffect } from "react";

/** Keep portalled dialogs inside the area left by the mobile keyboard. */
export function useVisualViewport(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = (): void => {
      document.documentElement.style.setProperty("--visual-height", `${viewport.height}px`);
      document.documentElement.style.setProperty("--visual-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--visual-height");
      document.documentElement.style.removeProperty("--visual-top");
    };
  }, []);
}

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui";

/** Light/dark toggle button. Keyboard-operable, visible focus ring, accurate `aria-label`. */
export function ThemeToggle(): JSX.Element {
  const { resolved, toggle } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme (Ctrl/Cmd+Shift+L)"
    >
      {resolved === "dark" ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </Button>
  );
}

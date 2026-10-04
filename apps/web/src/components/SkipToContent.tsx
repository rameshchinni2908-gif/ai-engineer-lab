/** WCAG 2.4.1 bypass block. Visually hidden until focused (first Tab press). */
export function SkipToContent({ targetId = "main-content" }: { targetId?: string }): JSX.Element {
  return (
    <a
      href={`#${targetId}`}
      className={
        "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] " +
        "focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground " +
        "focus:outline-none focus:ring-2 focus:ring-ring"
      }
    >
      Skip to main content
    </a>
  );
}

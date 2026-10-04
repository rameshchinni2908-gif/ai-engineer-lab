import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { buttonVariants } from "@/components/ui";

function FullPageError({ error, reset }: { error: Error; reset: () => void }): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">{error.message}</p>
      <div className="flex gap-2">
        <button type="button" className={buttonVariants({ variant: "secondary" })} onClick={reset}>
          Try again
        </button>
        <a className={buttonVariants()} href="/">
          Reload app
        </a>
      </div>
    </div>
  );
}

/** Top-level error boundary + router. Per-module errors are caught one level down in `app/router.tsx`. */
export default function App(): JSX.Element {
  return (
    <ErrorBoundary fallback={(error, reset) => <FullPageError error={error} reset={reset} />}>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

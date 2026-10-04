import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui";
import { ThemeProvider } from "@/hooks/useTheme";
import { DifficultyProvider } from "@/hooks/useDifficulty";
import { ApiClientError } from "@/lib/api";

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && !isRetryableStatus(error.status)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Composes every app-wide provider required by CLAUDE.md's global features:
 * TanStack Query, difficulty context, theme context, and Radix's tooltip
 * root. Mounted once in `main.tsx`, above the router.
 */
export function AppProviders({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DifficultyProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </DifficultyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProviderId } from "@ail/shared";
import { api, queryKeys } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Badge,
} from "@/components/ui";
import { ErrorState } from "@/components/EmptyState";
import { PricingDisclosure } from "@/components/PricingDisclosure";
import { cn } from "@/lib/utils";

export interface ProviderModelSelectorProps {
  providerId: ProviderId;
  model: string;
  onChange: (next: { providerId: ProviderId; model: string }) => void;
  className?: string;
  /** Restrict the model list to those matching a capability, e.g. only vision-capable models. */
  filter?: (model: { providerId: ProviderId; id: string; supportsTools: boolean; supportsVision: boolean; supportsLogprobs: boolean; supportsThinking: boolean }) => boolean;
}

/**
 * Provider + model picker backed by `GET /api/models` and `GET /api/providers`.
 * Defaults to `mock` (per CLAUDE.md, the app MUST work with zero API keys),
 * flags providers without configured keys as disabled, and surfaces
 * context window + per-MTok cost for the selected model.
 */
export function ProviderModelSelector({
  providerId,
  model,
  onChange,
  className,
  filter,
}: ProviderModelSelectorProps): JSX.Element {
  const providersQuery = useQuery({
    queryKey: queryKeys.providers,
    queryFn: () => api.providers(),
  });
  const modelsQuery = useQuery({
    queryKey: queryKeys.models(),
    queryFn: () => api.models(),
  });

  if (providersQuery.isLoading || modelsQuery.isLoading) {
    return <Skeleton className={cn("h-10 w-full", className)} />;
  }

  if (providersQuery.isError || modelsQuery.isError) {
    return (
      <ErrorState
        message="Could not load providers/models. Falling back to Mock is always available once the API is reachable."
        className={className}
      />
    );
  }

  const providers = providersQuery.data?.providers ?? [];
  const allModels = modelsQuery.data?.models ?? [];
  const availableSet = new Set(providers.filter((p) => p.available).map((p) => p.id));
  const models = filter ? allModels.filter(filter) : allModels;
  const selected = models.find((m) => m.id === model && m.providerId === providerId);

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-end", className)}>
      <div className="flex-1">
        <Select
          value={`${providerId}::${model}`}
          onValueChange={(value) => {
            const [nextProvider, ...rest] = value.split("::");
            onChange({ providerId: nextProvider as ProviderId, model: rest.join("::") });
          }}
        >
          <SelectTrigger aria-label="Provider and model">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => {
              const configured = availableSet.has(m.providerId);
              return (
                <SelectItem key={`${m.providerId}::${m.id}`} value={`${m.providerId}::${m.id}`}>
                  <span className="flex items-center gap-2">
                    {m.displayName}
                    {!configured && m.providerId !== "mock" && (
                      <Badge variant="outline" className="text-[10px]">
                        no key
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {selected && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{selected.contextWindow.toLocaleString()} tok context</Badge>
          <Badge variant="outline">
            ${selected.inputCostPerMTok}/${selected.outputCostPerMTok} per MTok (in/out)
          </Badge>
          <PricingDisclosure />
          {!availableSet.has(selected.providerId) && selected.providerId !== "mock" && (
            <Badge variant="warning">key not configured - will error server-side</Badge>
          )}
        </div>
      )}
    </div>
  );
}

/** Alias matching the exact name used in docs/contracts.md §6 (`<ProviderModelSelect />`). */
export const ProviderModelSelect = ProviderModelSelector;

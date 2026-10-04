import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderId } from "@ail/shared";

interface ProviderModelState {
  providerId: ProviderId;
  model: string;
  setProviderId: (providerId: ProviderId) => void;
  setModel: (model: string) => void;
  setBoth: (providerId: ProviderId, model: string) => void;
}

/**
 * App-wide default provider/model selection, used to seed `<ProviderModelSelector>`
 * instances across modules so the user's choice persists as they navigate.
 * Defaults to `mock` / `mock-small` so the app works with zero API keys
 * (CLAUDE.md acceptance criterion).
 */
export const useProviderModelStore = create<ProviderModelState>()(
  persist(
    (set) => ({
      providerId: "mock",
      model: "mock-small",
      setProviderId: (providerId) => set({ providerId }),
      setModel: (model) => set({ model }),
      setBoth: (providerId, model) => set({ providerId, model }),
    }),
    { name: "ail-provider-model" },
  ),
);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProviders } from "@/app/providers";
import "./styles/globals.css";
import { registerSW } from "virtual:pwa-register";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent("ail-update-ready", { detail: () => updateSW(true) }));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && navigator.onLine) void registration.update().catch(() => undefined);
      });
    },
  });
}

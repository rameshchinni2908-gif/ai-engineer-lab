import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: "prompt",
    includeAssets: ["favicon.svg", "apple-touch-icon.png"],
    manifest: {
      id: "/",
      name: "AI Engineer Lab",
      short_name: "AI Lab",
      description: "Hands-on AI engineering lessons, playgrounds, and experiments.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f6f7f9",
      theme_color: "#101820",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "LLM Fundamentals", url: "/m/fundamentals/playground" },
        { name: "Prompt Engineering", url: "/m/prompting/playground" },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      navigateFallbackDenylist: [/^\/api(?:\/|$)/],
      cleanupOutdatedCaches: true,
    },
  })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/** Web deploy under victor-legall.com/satisfactory-remodeller; Tauri desktop stays at /. */
const isTauri =
  !!process.env.TAURI_ENV_PLATFORM ||
  process.env.TAURI_ENV_DEBUG === "true" ||
  process.env.TAURI_ENV_DEBUG === "1";
const base = isTauri ? "/" : "/satisfactory-remodeller/";

// https://vite.dev/config/
export default defineConfig(async () => ({
  base,
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    /** Utiliser `vite --open` (`npm run dev:browser`) pour Safari ; Tauri lance `vite` sans ouverture navigateur. */
    open: false,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

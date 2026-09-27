import path from "node:path";
import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

// https://vite.dev/config/
export default defineConfig(async () => ({
  base: "/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_ISO__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [tailwindcss(), react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        "routing-lab": path.resolve(__dirname, "routing-lab.html"),
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    open: false,
  },
}));

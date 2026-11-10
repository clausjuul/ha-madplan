import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// `npm run dev` -> fake in-memory API. `npm run dev:server` (mode "server") proxies /api to the real server.
// Production builds always use the real HTTP client (fake data is tree-shaken out) unless VITE_FAKE_API=1.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const fake = mode === "server" || command === "build" ? env.VITE_FAKE_API === "1" : env.VITE_FAKE_API !== "0";
  return {
    // Relative base: Home Assistant Ingress serves the app under a token path prefix.
    base: "./",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    define: { __FAKE_API__: JSON.stringify(fake) },
    server: {
      port: 5174,
      proxy:
        mode === "server"
          ? { "/api": env.VITE_API_PROXY || env.MADPLAN_API || "http://localhost:8099" }
          : undefined,
    },
    build: { outDir: "dist", sourcemap: false },
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.{ts,tsx}"],
    },
  };
});


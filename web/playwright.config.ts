import { defineConfig } from "@playwright/test";

// Override with E2E_PORT when 5174 is taken by another dev server (PW_REUSE=1 reuses a running one).
const port = Number(process.env.E2E_PORT ?? 5174);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  reporter: "list",
  // Tests against the real server live in playwright.integration.config.ts.
  grepInvert: /@integration/,
  use: { baseURL: `http://localhost:${port}`, colorScheme: "dark" },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: process.env.PW_REUSE === "1",
    timeout: 60_000,
  },
});

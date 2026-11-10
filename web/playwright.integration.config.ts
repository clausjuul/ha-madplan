import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Starts the REAL server (temp database) and the web app in server mode (proxying /api to it).
// Run with: npm run e2e:integration -w web
const SERVER_PORT = 8199;
const WEB_PORT = 5175;
process.env.MADPLAN_IT_DIR ??= mkdtempSync(join(tmpdir(), "madplan-it-"));

export default defineConfig({
  testDir: "./e2e",
  grep: /@integration/,
  timeout: 60_000,
  reporter: "list",
  workers: 1,
  use: { baseURL: `http://localhost:${WEB_PORT}`, colorScheme: "dark" },
  webServer: [
    {
      command: "node src/main.ts",
      cwd: "../server",
      url: `http://localhost:${SERVER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(SERVER_PORT),
        MADPLAN_DB: join(process.env.MADPLAN_IT_DIR, "madplan.sqlite"),
        MADPLAN_ALLOW_ANY_ORIGIN: "1",
        TZ: "Europe/Copenhagen",
      },
    },
    {
      command: `npx vite --mode server --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_PROXY: `http://localhost:${SERVER_PORT}` },
    },
  ],
});

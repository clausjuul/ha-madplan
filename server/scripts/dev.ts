/** Dev runner: watch mode with a local database and no ingress check. Cross-platform (no shell env syntax). */
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--watch", "src/main.ts"], {
  stdio: "inherit",
  env: {
    MADPLAN_DB: "./dev.sqlite",
    MADPLAN_ALLOW_ANY_ORIGIN: "1",
    PORT: "8099",
    ...process.env,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));

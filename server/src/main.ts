import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createOpenAiClient } from "./ai/openai.ts";
import { BACKUP_INTERVAL_MS, createDailyBackup } from "./backup.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { Jobs } from "./deps.ts";
import type { Deps } from "./deps.ts";
import { setupCards } from "./ha/cards.ts";
import { setupVoice } from "./ha/voice.ts";
import { createPublisher } from "./ha/publisher.ts";
import { offerSyncFor } from "./offers/sync.ts";
import { Repo } from "./repo.ts";
import { failInterruptedDrafts } from "./services/drafts.ts";
import { fetchSupervisorTimeZone } from "./timezone.ts";

const config = loadConfig();
if (config.supervisorToken) {
  // Home Assistant's own zone wins over the container's TZ, so "today" matches the household's wall clock.
  const zone = await fetchSupervisorTimeZone(config.supervisorToken);
  if (zone) config.timeZone = zone;
  else console.warn(`Kunne ikke læse tidszone fra Home Assistant; bruger ${config.timeZone}`);
}
console.log(`Tidszone: ${config.timeZone}`);
// Before the publisher starts, so entity pictures point at /local/madplan and the ingress path is known.
await setupCards(config);
// Not awaited: voice commands are a convenience and must never delay the app.
void setupVoice(config);
const db = openDatabase(config.dbPath);
const repo = new Repo(db);
if (failInterruptedDrafts(repo) > 0) console.warn("Et afbrudt planudkast blev markeret som fejlet.");
const deps: Deps = {
  repo,
  config,
  openai: createOpenAiClient(config.openaiKey),
  fetch,
  now: () => new Date(),
  jobs: new Jobs(),
};

const app = createApp(deps);
const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Madplan ${config.version} lytter på port ${info.port} (database: ${config.dbPath})`);
});

const backup = (): void => {
  try {
    const result = createDailyBackup(db, config.dbPath, deps.now(), 7, config.timeZone);
    if ("file" in result && result.created) console.log(`Sikkerhedskopi oprettet: ${result.file}`);
  } catch (error) {
    console.error("Sikkerhedskopi fejlede", error);
  }
};
backup();
const backupTimer = setInterval(backup, BACKUP_INTERVAL_MS);
backupTimer.unref();

const publisher = createPublisher(deps);
publisher.start();
const offers = offerSyncFor(deps);
offers.start();

function shutdown(): void {
  publisher.stop();
  offers.stop();
  clearInterval(backupTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

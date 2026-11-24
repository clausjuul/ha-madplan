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
import { startVoiceShopping } from "./ha/voice-shopping.ts";
import { setupIntegration } from "./ha/integration.ts";
import { createInternalApp, loadInternalToken } from "./internal/api.ts";
import { dirname, join } from "node:path";
import { createPublisher } from "./ha/publisher.ts";
import { offerSyncFor } from "./offers/sync.ts";
import { Repo } from "./repo.ts";
import { tidyImportedDishes } from "./store-dishes.ts";
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
const tidied = repo.mutate(["dishes", "shopping"], () => tidyImportedDishes(db));
if (tidied > 0) console.log(`Ryddede op i ${tidied} importerede opskrifter.`);
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

// The Home Assistant integration's API: own port on the Supervisor network, guarded by the app's token.
const internalToken = loadInternalToken(join(dirname(config.dbPath), "internal-token"));
const internalServer = serve({ fetch: createInternalApp(deps, internalToken).fetch, port: config.internalPort, hostname: "0.0.0.0" });
// Not awaited, like the voice commands: installs custom_components/madplan and announces the API.
void setupIntegration(config, internalToken);

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
// Voice commands, and a force-publish of the sensors whenever Home Assistant has restarted.
const voiceShopping = startVoiceShopping(deps, { onHomeAssistantUp: () => void publisher.publish(true) });

function shutdown(): void {
  publisher.stop();
  offers.stop();
  voiceShopping.stop();
  clearInterval(backupTimer);
  internalServer.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

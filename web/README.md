# Web

React 19 + Vite + Tailwind v4 UI for Madplan (Ingress, tablet first).

- `npm run dev` - in-memory fake API (default), http://localhost:5174
- `npm run dev:server` - proxies /api to http://localhost:8099 (override with `VITE_API_PROXY`)
- `npm test` / `npm run e2e` (Playwright; `npm run shots` writes screenshots, set SHOTS_DIR).
  If port 5174 is taken, run with `E2E_PORT=5181`.

## Integration tests (real server)

`npm run e2e:integration -w web` (from `madplan-app/`) starts the real server (`node server/src/main.ts`, a fresh temp
SQLite database, `MADPLAN_ALLOW_ANY_ORIGIN=1`, `TZ=Europe/Copenhagen`, port 8199) and the web app in server mode
(port 5175, `/api` proxied to the server), then runs the `@integration` specs one at a time, in file order:

1. `integration-library.spec.ts` - needs the EMPTY database: imports `e2e/fixtures/v1.json` through the settings UI,
   then creates, archives and restores a dish.
2. `integration-shopping.spec.ts` - plans a dish for today, checks an item in Indkøb, reloads and asserts it stays checked.

The default `npm run e2e` skips `@integration`.


# @madplan/server

Hono + node:sqlite API for Madplan (contract: `domain/src/api.ts`). TypeScript runs directly on Node 24
(type stripping, no build step); `@madplan/domain` resolves through the npm workspace symlink.

    npm run dev -w server     # watch mode, ./dev.sqlite, no ingress check, port 8099
    npm test -w server
    node server/src/main.ts   # production entry

Environment: `MADPLAN_DB`, `PORT`, `MADPLAN_WEB_DIR`, `OPENAI_API_KEY`, `PREJ_API_KEY`, `SUPERVISOR_TOKEN`,
`MADPLAN_ALLOW_ANY_ORIGIN=1` (dev only), `MADPLAN_PUBLIC_IMAGE_BASE` (for the sensor entity_picture),
`MADPLAN_PLAN_MODEL`, `MADPLAN_DISCOVERY_MODEL`. Add-on options are read from `/data/options.json`.

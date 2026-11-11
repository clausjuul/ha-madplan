/**
 * Assembles a self-contained local add-on folder at dist-local/madplan/ for installing through
 * /addons before the repository is public (no registry image: Home Assistant builds it locally).
 *
 *   npm run build -w web && node scripts/bundle-local.ts
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-local", "madplan");

export const LOCAL_DOCKERFILE = `# Local add-on build: only copies prebuilt files; dependencies are installed here.
FROM node:24-alpine
ARG BUILD_VERSION=0.1.0
ARG BUILD_ARCH=amd64
LABEL io.hass.name="Madplan" \\
      io.hass.type="addon" \\
      io.hass.version="\${BUILD_VERSION}" \\
      io.hass.arch="\${BUILD_ARCH}"

WORKDIR /opt/madplan
RUN apk add --no-cache tzdata
COPY package.json package-lock.json ./
COPY domain/package.json domain/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=domain --workspace=server --ignore-scripts && npm cache clean --force
COPY domain/src domain/src
COPY server/src server/src
COPY server/assets server/assets
COPY web/dist web/dist

ENV NODE_ENV=production \\
    PORT=8099 \\
    MADPLAN_DB=/data/madplan.sqlite \\
    MADPLAN_WEB_DIR=/opt/madplan/web/dist
EXPOSE 8099
CMD ["node", "server/src/main.ts"]
`;

/** The published config.yaml minus its registry image, so Home Assistant builds the Dockerfile itself. */
export function localConfig(yaml: string): string {
  return yaml
    .split(/\r?\n/u)
    .filter((line) => !/^image\s*:/u.test(line))
    .join("\n");
}

function copy(from: string, to: string): void {
  cpSync(join(root, from), join(out, to), {
    recursive: true,
    filter: (source) => !source.includes("node_modules"),
  });
}

function main(): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // Add-on metadata (config, docs, translations) minus the Dockerfile-less image reference.
  cpSync(join(root, "madplan"), out, { recursive: true });
  writeFileSync(join(out, "config.yaml"), localConfig(readFileSync(join(root, "madplan", "config.yaml"), "utf8")));
  writeFileSync(join(out, "Dockerfile"), LOCAL_DOCKERFILE);

  for (const file of ["package.json", "package-lock.json"]) copy(file, file);
  copy("domain/package.json", "domain/package.json");
  copy("domain/src", "domain/src");
  copy("server/package.json", "server/package.json");
  copy("server/src", "server/src");
  copy("server/assets", "server/assets");
  copy("web/package.json", "web/package.json");

  const webDist = join(root, "web", "dist");
  if (existsSync(webDist)) {
    cpSync(webDist, join(out, "web", "dist"), { recursive: true });
  } else {
    console.warn("web/dist findes ikke - kør 'npm run build -w web' først. Bundlen får en tom brugerflade.");
    mkdirSync(join(out, "web", "dist"), { recursive: true });
  }
  console.log(`Lokal add-on klar: ${out}\nKopiér mappen til /addons/madplan på Home Assistant og installér den under Lokale tilføjelser.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

# Build context = the madplan-app root (this folder). Multi-arch images are built by .github/workflows/build.yaml.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY domain/package.json domain/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY tsconfig.base.json ./
COPY domain domain
COPY server server
COPY web web
# The web workspace is built in parallel with the server; tolerate it having no build script yet.
RUN if node -e "process.exit(require('./web/package.json').scripts?.build ? 0 : 1)"; then \
      npm run build -w web; \
    else \
      echo "web has no build script yet; shipping an empty web/dist"; \
    fi && mkdir -p web/dist

FROM node:24-alpine
ARG BUILD_VERSION=0.1.0
ARG BUILD_ARCH=amd64
LABEL io.hass.name="Madplan" \
      io.hass.description="Familiens madplan, indkøbsliste og ugeplanlægger" \
      io.hass.type="addon" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.source="https://github.com/clausjuul/ha-madplan"

WORKDIR /opt/madplan
# tzdata lets the TZ variable passed by the Supervisor take effect.
RUN apk add --no-cache tzdata
COPY package.json package-lock.json ./
COPY domain/package.json domain/
COPY server/package.json server/
COPY web/package.json web/
# Production dependencies of the server (and the domain workspace it links to) only.
RUN npm ci --omit=dev --workspace=domain --workspace=server --ignore-scripts && npm cache clean --force
COPY domain/src domain/src
COPY server/src server/src
COPY --from=build /app/web/dist web/dist

ENV NODE_ENV=production \
    PORT=8099 \
    MADPLAN_DB=/data/madplan.sqlite \
    MADPLAN_WEB_DIR=/opt/madplan/web/dist
EXPOSE 8099
# Node 24 strips TypeScript types itself, so there is no build step for the server.
CMD ["node", "server/src/main.ts"]

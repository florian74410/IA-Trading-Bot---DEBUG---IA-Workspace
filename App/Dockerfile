# IA-TB GEN-1 — build-only validation image (no engines started).
FROM node:22-bookworm AS dependencies
WORKDIR /opt/iatb/App
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && node -e "const p=require('better-sqlite3/package.json');if(p.version!=='12.4.1')process.exit(1)"

FROM node:22-bookworm
WORKDIR /opt/iatb/App
ENV NODE_ENV=production
COPY --from=dependencies /opt/iatb/App/node_modules ./node_modules
COPY --from=dependencies /opt/iatb/App/package.json ./package.json
COPY --from=dependencies /opt/iatb/App/package-lock.json ./package-lock.json
# Initial build is deliberately limited to a safe preflight script.
# Full application sources and mutable volumes are added in a later audited phase.
COPY Tools/sqlite_preflight.js ./Tools/sqlite_preflight.js
# No daemon or trading engine starts when this image is run.
CMD ["node", "Tools/sqlite_preflight.js"]

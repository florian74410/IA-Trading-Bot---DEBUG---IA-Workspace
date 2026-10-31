# IA-TB GEN-1 full application validation image.
# No runtime npm installation and no engine is started by default.
FROM node:22-bookworm AS dependencies
WORKDIR /opt/iatb/App
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm
WORKDIR /opt/iatb/App
ENV NODE_ENV=production
COPY --from=dependencies /opt/iatb/App/node_modules ./node_modules
COPY . .
# No service starts implicitly; compose provides explicit service commands.
# QA/preflight scripts remain in Git but are not copied into this image.
CMD ["node", "-e", "console.log('IA-TB GEN-1 runtime image: start services through compose only')"]

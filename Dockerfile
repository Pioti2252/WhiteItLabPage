# syntax=docker/dockerfile:1.7
#
# whiteitlab web — multi-stage build
#   1) build  : installs dev deps, renders the static site into /src/dist
#   2) deps   : installs production deps only (nodemailer)
#   3) runtime: distroless Node, no shell, no package manager, runs as UID 65532
#
# Tip: pin images by digest in production, e.g.
#   docker buildx imagetools inspect gcr.io/distroless/nodejs22-debian12:nonroot
# and replace the tag with `...@sha256:<digest>` (see docs/SECURITY.md).

ARG NODE_BUILD_IMAGE=node:22-alpine
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot

# ---------------------------------------------------------------- build ---
FROM ${NODE_BUILD_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: no install-time code from dependencies runs during build
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY site ./site
RUN npm run build

# ----------------------------------------------------------------- deps ---
FROM ${NODE_BUILD_IMAGE} AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

# -------------------------------------------------------------- runtime ---
FROM ${RUNTIME_IMAGE} AS runtime
LABEL org.opencontainers.image.title="whiteitlab-web" \
      org.opencontainers.image.description="whiteitlab.pl — site + contact form API" \
      org.opencontainers.image.source="https://github.com/Pioti2252"

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    TRUST_PROXY=1

# Files are owned by root and read-only for the app user: the process
# cannot modify its own code or content even if compromised.
COPY --from=deps  --chown=0:0 --chmod=0755 /app/node_modules ./node_modules
COPY              --chown=0:0 --chmod=0755 package.json ./
COPY              --chown=0:0 --chmod=0755 server ./server
COPY --from=build --chown=0:0 --chmod=0755 /src/dist ./dist

# Distroless ":nonroot" already defaults to this, stated explicitly for clarity/scanners.
USER 65532:65532

EXPOSE 8080

# No shell/curl in distroless -> healthcheck is a tiny Node script.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "/app/server/healthcheck.mjs"]

# Entrypoint of the distroless image is /nodejs/bin/node
CMD ["server/server.mjs"]

# syntax=docker/dockerfile:1
#
# RedactPlus marketing site: production image.
#
# Build through deployment/redactplus/scripts/build-image.sh, which exports the exact
# approved commit with `git archive` and passes its SHA. Building by hand:
#
#   docker build --platform linux/amd64 \
#     -f deployment/redactplus/Dockerfile \
#     --build-arg GIT_COMMIT="$(git rev-parse HEAD)" \
#     -t registry.safaridesk.io/safari/redactplus-landing:"$(git rev-parse HEAD)" .
#
# The build context root must carry the repository's .dockerignore (an allowlist).

# Node 22 matches CI and the release workflow. The tag is pinned to its multi-arch
# index digest so a re-pushed upstream tag cannot change a rebuild of the same commit.
ARG NODE_IMAGE=node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

# ---------------------------------------------------------------------------------
# Dependencies, installed exactly from the lockfile. Dev dependencies are needed to
# build (TypeScript, Tailwind, tsx for content validation) and stay in this stage.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------------
# Build. `npm run build` runs content:validate first (prebuild), then `next build`
# with output: "standalone".
FROM deps AS build
COPY . .

# Read by the build and fixed into the output; changing any needs a new image.
#   NEXT_PUBLIC_DOCUMENTATION_URL  inlined into the navigation bundle
#   NEXT_PUBLIC_PORTAL_URL         customer portal origin: the Download dialog with Create
#                                  account and Sign in (empty keeps the sales links, for CI)
#   SITE_NOINDEX                  next.config.ts headers and the static /robots.txt
#   SITE_CANONICAL_ORIGIN          canonical links, sitemap, robots.txt, structured data
#                                  (also baked into the runtime ENV below, so the
#                                  prerendered and per-request output agree)
# Production images leave the documentation URL and SITE_NOINDEX empty and set
# NEXT_PUBLIC_PORTAL_URL=https://home.redactplus.io (build-image.sh then requires the site key).
ARG NEXT_PUBLIC_DOCUMENTATION_URL=""
ARG NEXT_PUBLIC_PORTAL_URL=""
ARG NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH=""
# Registration security check: the Turnstile site key is public (its secret is on the Control
# Center API). Without it the registration form says account creation is unavailable.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ARG SITE_NOINDEX=""
ARG SITE_CANONICAL_ORIGIN="https://redactplus.io"
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    CMS_ENABLED=false \
    NEXT_PUBLIC_DOCUMENTATION_URL=${NEXT_PUBLIC_DOCUMENTATION_URL} \
    NEXT_PUBLIC_PORTAL_URL=${NEXT_PUBLIC_PORTAL_URL} \
    NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH=${NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    SITE_NOINDEX=${SITE_NOINDEX} \
    SITE_CANONICAL_ORIGIN=${SITE_CANONICAL_ORIGIN}

RUN npm run build

# ---------------------------------------------------------------------------------
# Runtime: the traced standalone server, its static chunks and the public assets.
# No source tree, no dev dependencies, no package manager.
FROM ${NODE_IMAGE} AS runtime

ARG GIT_COMMIT
ARG RELEASE_ID=""
ARG SITE_CANONICAL_ORIGIN="https://redactplus.io"
RUN echo "${GIT_COMMIT}" | grep -Eq '^[0-9a-f]{40}$' \
    || { echo "GIT_COMMIT must be the full 40-character commit SHA" >&2; exit 1; }

# The image is never used to install anything, so the bundled package managers go.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

LABEL org.opencontainers.image.title="redactplus-landing" \
      org.opencontainers.image.source="https://github.com/Safe-Redact/Marketing-Site" \
      org.opencontainers.image.revision="${GIT_COMMIT}"

# /api/health reports these, so a running container always names the commit it
# serves. HOSTNAME overrides the container hostname Docker would otherwise inject,
# which the standalone server would try to bind to.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SAFEREDACT_COMMIT_SHA=${GIT_COMMIT} \
    SAFEREDACT_RELEASE_ID=${RELEASE_ID} \
    SITE_CANONICAL_ORIGIN=${SITE_CANONICAL_ORIGIN}

WORKDIR /app

# Application files stay root-owned and read-only to the runtime user. Only the
# image-optimisation cache is writable.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p .next/cache && chown node:node .next/cache

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>r.ok?r.json():null).then(b=>process.exit(b&&b.status==='ready'?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]

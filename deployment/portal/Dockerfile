# syntax=docker/dockerfile:1
#
# RedactPlus customer portal (home.redactplus.io): production image.
# FILES ONLY — not built or deployed yet. See README.md for the prerequisites.
#
# The build context is the portal application directory, not the repository root:
#
#   docker build --platform linux/amd64 \
#     -f deployment/portal/Dockerfile \
#     --build-arg GIT_COMMIT="$(git rev-parse HEAD)" \
#     -t registry.safaridesk.io/safari/redactplus-portal:"$(git rev-parse HEAD)" apps/portal
#
# apps/portal/.dockerignore keeps local env files, build output, tests and the development
# identity provider out of the context.

ARG NODE_IMAGE=node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# `npm run build` validates content/releases.json first, then runs `next build`.
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ARG GIT_COMMIT
RUN echo "${GIT_COMMIT}" | grep -Eq '^[0-9a-f]{40}$' \
    || { echo "GIT_COMMIT must be the full 40-character commit SHA" >&2; exit 1; }
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
LABEL org.opencontainers.image.title="redactplus-portal" \
      org.opencontainers.image.source="https://github.com/Safe-Redact/Marketing-Site" \
      org.opencontainers.image.revision="${GIT_COMMIT}"
# Production rules apply because PORTAL_ENVIRONMENT is not set (src/lib/config.ts).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PORTAL_COMMIT_SHA=${GIT_COMMIT}
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/content ./content
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>r.ok?r.json():null).then(b=>process.exit(b&&b.status==='ready'?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

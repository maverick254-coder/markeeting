# syntax=docker/dockerfile:1
#
# RedactPlus forum backend: NodeBB with the RedactPlus bridge, private behind the portal.
# FILES ONLY — not built or deployed. See README.md and RUNBOOK.md.
#
# Build in CI (or any build machine), never on the production server: the asset build is the
# memory and disk peak. The build context is the repository root; Dockerfile.dockerignore (next
# to this file) lets in only the bridge plugin and these deployment scripts.
#
#   docker build --platform linux/amd64 \
#     -f deployment/forum/Dockerfile \
#     --build-arg GIT_COMMIT="$(git rev-parse HEAD)" \
#     -t registry.safaridesk.io/safari/redactplus-forum:"$(git rev-parse HEAD)" .
#
# Pinned: Node (same base image as the portal, so the host stores it once), NodeBB by release
# commit, and every plugin by exact version. Changing any of them is a deliberate change here.

ARG NODE_IMAGE=node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
ARG NODEBB_VERSION=v4.16.7
ARG NODEBB_COMMIT=e10be67aceaec0581fd130c6ef7b5e2f1e7f64f2

# ---------- NodeBB source at the pinned release commit ----------
FROM ${NODE_IMAGE} AS source
ARG NODEBB_VERSION
ARG NODEBB_COMMIT
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${NODEBB_VERSION}" https://github.com/NodeBB/NodeBB.git /usr/src/app \
 && test "$(git -C /usr/src/app rev-parse HEAD)" = "${NODEBB_COMMIT}" \
 && rm -rf /usr/src/app/.git

# ---------- dependencies, plugins and the asset build ----------
FROM ${NODE_IMAGE} AS build
# A throwaway Redis exists only in this stage: `nodebb build` needs a data store to start,
# and nothing it writes there is kept.
RUN apt-get update \
 && apt-get install -y --no-install-recommends redis-server \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY --from=source /usr/src/app ./
RUN cp install/package.json package.json
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-audit --no-fund \
 && npm install --omit=dev --no-audit --no-fund --save-exact \
      nodebb-plugin-question-and-answer@2.0.5 \
      nodebb-plugin-dbsearch@7.0.7 \
      nodebb-plugin-2factor@8.0.12
COPY services/forum-bridge/package.json services/forum-bridge/plugin.json services/forum-bridge/library.js services/forum-bridge/categories.json node_modules/nodebb-plugin-redactplus-bridge/
COPY services/forum-bridge/lib node_modules/nodebb-plugin-redactplus-bridge/lib
COPY services/forum-bridge/scripts node_modules/nodebb-plugin-redactplus-bridge/scripts
COPY deployment/forum/scripts/write-config.js deployment/forum/scripts/bootstrap.js deployment/forum/scripts/entrypoint.sh /opt/redactplus/
# Build-time only (not copied into the runtime image). At runtime the root filesystem is
# read-only, so nothing may write into build/: the Harmony theme's startup skin rebuild is removed,
# and every skin is built here, so a skin request never triggers NodeBB's on-demand build.
COPY deployment/forum/scripts/patch-harmony.js deployment/forum/scripts/prebuild-skins.js deployment/forum/scripts/verify-assets.js /opt/redactplus-build/
RUN node /opt/redactplus-build/patch-harmony.js
RUN redis-server --daemonize yes --save '' --appendonly no \
 && FORUM_DATABASE=redis REDACTPLUS_CONFIG_PATH=/tmp/build-config.json FORUM_URL=http://localhost:4567 FORUM_SECRET=build-only \
    node /opt/redactplus/write-config.js \
 && node ./nodebb build --config /tmp/build-config.json --series \
 && node /opt/redactplus-build/prebuild-skins.js /tmp/build-config.json \
 && redis-cli shutdown nosave \
 && rm -f /tmp/build-config.json \
 && rm -rf /root/.npm /tmp/*

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ARG GIT_COMMIT
RUN echo "${GIT_COMMIT}" | grep -Eq '^[0-9a-f]{40}$' \
    || { echo "GIT_COMMIT must be the full 40-character commit SHA" >&2; exit 1; }
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
LABEL org.opencontainers.image.title="redactplus-forum" \
      org.opencontainers.image.source="https://github.com/Safe-Redact/Marketing-Site" \
      org.opencontainers.image.revision="${GIT_COMMIT}"
WORKDIR /usr/src/app
COPY --from=build --chown=node:node /usr/src/app ./
COPY --from=build /opt/redactplus /opt/redactplus
# Uploads are the only data NodeBB keeps on disk; they live on a volume (see compose.yaml).
RUN mkdir -p public/uploads/files /run/nodebb && chown -R node:node public/uploads /run/nodebb \
 && chmod 755 /opt/redactplus/entrypoint.sh
# Fails the build unless this final filesystem already holds every asset NodeBB would otherwise
# copy or build into build/public at runtime (read-only: EROFS). The script is mounted, not shipped.
RUN --mount=type=bind,from=build,source=/opt/redactplus-build,target=/opt/redactplus-build \
    node /opt/redactplus-build/verify-assets.js /usr/src/app
ENV NODE_ENV=production \
    REDACTPLUS_CONFIG_PATH=/run/nodebb/config.json \
    REDACTPLUS_FORUM_COMMIT=${GIT_COMMIT}
USER node
EXPOSE 4567
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4567/redactplus-bridge/v1/health',{headers:{'x-redactplus-bridge-key':process.env.REDACTPLUS_BRIDGE_KEY}}).then(r=>r.ok?r.json():null).then(b=>process.exit(b&&b.data&&b.data.status==='ready'?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/opt/redactplus/entrypoint.sh"]

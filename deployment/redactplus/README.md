# RedactPlus deployment package

Production packaging for serving this marketing site at **redactplus.io** from the
existing SafariDesk server (`31.97.42.73`). It's an inspectable package: nothing here
has been installed on the server, pushed to the registry, or pointed at by DNS.

The deployed design is chosen by **which commit the image is built from**, not by a
branch. `main` (Design B) and `master` (Design A) both build with the same tooling, and
switching between them is an image change with no DNS or Nginx change.

| File | Purpose | Installed to |
|---|---|---|
| `Dockerfile` | Multi-stage build → standalone Next.js server, non-root | (build machine) |
| `../../.dockerignore` | Allowlist build context | (build machine) |
| `compose.yaml` | Service template | `/root/deploy/redactplus-landing/compose.yaml` |
| `release.env.example` | Release pin (SHA + digest) | `/root/deploy/redactplus-landing/.env` |
| `app.env.example` | Runtime settings, names and placeholders only | `/root/deploy/redactplus-landing/app.env` (600) |
| `nginx/redactplus.io.bootstrap.conf` | Stage 1: HTTP + ACME only, no certificate refs | `/etc/nginx/sites-available/redactplus.io` |
| `nginx/redactplus.io.conf` | Stage 2: HTTPS reverse proxy to `127.0.0.1:6095` | `/etc/nginx/sites-available/redactplus.io` |
| `scripts/build-image.sh` | Builds one exact commit from `git archive`, never pushes | (build machine) |
| `scripts/check-runtime-tree.mjs` | Asserts the image holds what it needs and nothing else | runs inside the image |
| `scripts/smoke-test.mjs` | Read-only HTTP checks: routes, headers, assets, health | build machine / server |
| `DEPLOYMENT.md` | Release procedure and checklist, with approval gates | — |
| `DNS-AND-TLS.md` | DNS record plan and certificate issuance | — |
| `ROLLBACK.md` | Rolling back image, Compose, Nginx and DNS | — |

## Image

- **Base:** `node:22.23.4-bookworm-slim`, pinned to its index digest (Node 22 matches CI).
  Debian rather than Alpine so `sharp`, which `next/image` uses, gets its glibc binary.
- **Stages:** `deps` (`npm ci` from the lockfile) → `build` (`npm run build`, which runs
  `content:validate` first) → `runtime` (only `.next/standalone`, `.next/static`, `public`).
- **Runtime:**
  - Runs as `node` (uid 1000) on port 3000.
  - The app tree is root-owned. Only `.next/cache` (the image-optimisation cache) is writable.
  - npm, npx, corepack and yarn are removed.
- **Identity:**
  - The `GIT_COMMIT` build arg must be a full SHA, or the build fails.
  - It becomes `SAFEREDACT_COMMIT_SHA`, which `/api/health` reports.
  - It is also recorded in the `org.opencontainers.image.revision` label.
- **Healthcheck:** `GET /api/health` must return `{"status":"ready"}`.
- **Not in the image:**
  - The build context is an allowlist, so these never enter any layer: `assets/` (screenshot masters), `docs/`, `tests/`, `services/`, `.git`, `.env*`, key material.
  - `check-runtime-tree.mjs` re-verifies this inside the built image.

### Build-time vs runtime configuration

| Variable | When read | Changing it needs |
|---|---|---|
| `NEXT_PUBLIC_DOCUMENTATION_URL` | **Build** (inlined into the client bundle) | a new image |
| `NEXT_PUBLIC_PORTAL_URL` | **Build**. Bare https origin of the customer portal. Set, the header, mobile menu and homepage hero's primary action become Download, opening one shared sign-in dialog that links to `<portal>/auth/start`; unset or invalid, those buttons stay "Request a Demo" exactly as before. Leave unset until the portal is live (`deployment/portal/README.md`). | a new image |
| `NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH` | **Build**. `enabled` lets the Download dialog's account form submit to the portal, and adds the portal origin to `connect-src`. Leave unset until the backend credential API exists (`docs/portal/backend-integration-boundary.md` §6). Unset, the form validates but sends nothing and offers the RedactPlus sign-in redirect. | a new image |
| `SITE_NOINDEX` | **Build** (`next.config.ts` headers and the static `/robots.txt`) | a new image |
| `SITE_CANONICAL_ORIGIN` | **Build** (static `/robots.txt`) and runtime (metadata, sitemap, structured data). The image bakes the same value into both. Defaults to `https://redactplus.io` in this Dockerfile. | a new image |
| Everything in `app.env.example` | Request time (`process.env` on the server, including middleware) | `docker compose up -d` |
| `SAFEREDACT_COMMIT_SHA`, `SAFEREDACT_RELEASE_ID` | Baked as image `ENV` by the build | a new image |

Consequences:
- A production image is built with both build-time values empty.
- A review image built with `SITE_NOINDEX=true` gets a `-noindex` tag suffix from `build-image.sh` and must never be pinned in production.
- The same image can't serve both indexed and noindexed environments.

### Known application behaviour in a standalone deployment

- **`/admin/config.yml`:** with `CMS_ENABLED=false`, this route serves the fail-closed disabled profile: `200`, no-store, with only `.invalid` auth and site origins. `/admin` redirects to the static Decap shell, which cannot sign in. This was verified against the standalone build.
- **Writes outside `.next/cache`:** on first request Next copies prerendered route bodies (such as `/robots.txt`) into `.next/server/route-cache`. Next catches a failed copy and serves from memory. `compose.yaml` still mounts a small tmpfs there, so the read-only root filesystem never depends on that.
- **Canonical URL:** `SITE_CANONICAL_ORIGIN` (in `src/content/site.ts`) sets the origin used in metadata, the sitemap, `robots.txt` and structured data. This image sets it to `https://redactplus.io`. Builds without it, such as Netlify, keep `https://saferedact.io`. A value that isn't a bare HTTPS origin fails the build. Commits from before this setting existed (`master`, Design A) always name saferedact.io.
- **Branding still on the live site:**
  - Visible branding is RedactPlus, from the official logo kit (`public/images/brand/`, favicons and `site.webmanifest`).
  - The support address is `support@saferedact.io`.
  - The software download link goes to `https://saferedact.io/download`.
  - Internal identifiers (`SAFEREDACT_*`, the `saferedact-release/v1` health contract) are intentionally kept.

## Build locally

```bash
deployment/redactplus/scripts/build-image.sh origin/main
docker run --rm -d --name redactplus-smoke -p 127.0.0.1:3095:3000 --read-only \
  --tmpfs /tmp --tmpfs /app/.next/cache:mode=1777 \
  --tmpfs /app/.next/server/route-cache:mode=1777 \
  --env-file deployment/redactplus/app.env.example \
  registry.safaridesk.io/safari/redactplus-landing:<sha>
node deployment/redactplus/scripts/smoke-test.mjs http://127.0.0.1:3095 <sha>
docker rm -f redactplus-smoke
```

`app.env.example` is safe to use as-is for a local smoke run: every integration in it is off.

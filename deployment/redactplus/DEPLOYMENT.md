# RedactPlus release procedure and checklist

**[APPROVAL]** marks a step that needs an explicit, recorded go-ahead before anyone runs it.
Everything else is local or read-only.

Fixed coordinates:

| | |
|---|---|
| Server | `root@31.97.42.73` (Ubuntu 24.04, host Nginx 1.24, Docker 29, Compose v5) |
| Deploy directory | `/root/deploy/redactplus-landing/` |
| Image | `registry.safaridesk.io/safari/redactplus-landing:<full-sha>` |
| Upstream | `127.0.0.1:6095` → container `3000` |
| Nginx site | `/etc/nginx/sites-available/redactplus.io` (symlinked into `sites-enabled`) |
| Certificate lineage | `/etc/letsencrypt/live/redactplus.io/` (new; nothing existing is touched) |

## Before the first release (one-time)

1. **Content.** The canonical origin is handled by `SITE_CANONICAL_ORIGIN`, baked in as `https://redactplus.io`. Visible branding ("OpenRedakt", support email, download link) is a separate rebranding decision; see README.
2. **[APPROVAL] Disk.** The root filesystem was at 94% (14 GB free) during preparation. One release image is expected around 250–350 MB, and keeping three costs about 1 GB. Confirm there is headroom. Cleaning up other projects' images is a separate, approved task.
3. **Registry access** from the build machine: `docker login registry.safaridesk.io`.

## Release

| # | Step | Where | Gate |
|---|---|---|---|
| 1 | **Select the commit.** Record the full SHA and which design it is (`main` = B, `master` = A). Never deploy a branch name. | build machine | **[APPROVAL]** design and commit |
| 2 | **Verify it.** `git checkout --detach <sha>` in a clean worktree, then `npm ci`, `npm run typecheck`, `npm run lint`, `npm run check:secrets`, `npm run build`, `npm test`. | build machine | — |
| 3 | **Build the image** with `deployment/redactplus/scripts/build-image.sh <sha>`. It runs `check-runtime-tree.mjs` inside the image. | build machine | — |
| 4 | **Smoke-test the image** (README, "Build locally"). Run `EXPECT_CANONICAL_ORIGIN=https://redactplus.io node deployment/redactplus/scripts/smoke-test.mjs http://127.0.0.1:3095 <sha>`; it must print 0 failures. | build machine | — |
| 5 | **Push** with `docker push registry.safaridesk.io/safari/redactplus-landing:<sha>`. Record the `digest: sha256:…` it prints. | build machine | **[APPROVAL]** release |
| 6 | **Prepare the server** (first release only):<br>`mkdir -p /root/deploy/redactplus-landing`<br>Copy in `compose.yaml`.<br>Create `app.env` from `app.env.example`, then `chmod 600 app.env`. | server | **[APPROVAL]** server change |
| 7 | **Pin the release:**<br>`cd /root/deploy/redactplus-landing`<br>`[ -f .env ] && cp .env .env.previous`<br>Write `RELEASE_SHA=<sha>` and `RELEASE_DIGEST=sha256:<digest>` to `.env`.<br>`echo "$(date -u +%FT%TZ) <sha> <digest> <design>" >> releases.log` | server | (part of step 6/8 approval) |
| 8 | **Pull and start:**<br>`docker compose config --quiet`<br>`docker compose pull`<br>`docker compose up -d` | server | **[APPROVAL]** deploy |
| 9 | **Check localhost health.**<br>`docker compose ps` must show `healthy`.<br>`curl -s http://127.0.0.1:6095/api/health` must report `"commitSha":"<sha>"`.<br>`ss -ltn \| grep 6095` must show **only** `127.0.0.1:6095`. | server | — |
| 10 | **Enable Nginx** (first release only). Follow DNS-AND-TLS.md: DNS, then the bootstrap site, the certificate, and the final site. On later releases Nginx is untouched. | server + DNS | **[APPROVAL]** DNS, certificate, Nginx |
| 11 | **Check public HTTPS.**<br>`curl -sI https://redactplus.io/` must return 200, one `content-security-policy`, one `strict-transport-security`, and no `x-powered-by`.<br>`curl -sI http://redactplus.io/` and `https://www.redactplus.io/` must both 301 to `https://redactplus.io/`.<br>Also run `node smoke-test.mjs https://redactplus.io <sha>` from any machine. | anywhere | — |
| 12 | **Confirm nothing else changed.**<br>`docker ps` count and states must match the pre-release snapshot.<br>`nginx -t` must pass.<br>Spot-check `https://pulzy.io`, `https://safaridesk.io` and `https://api.saferedact.io`.<br>Check the first lines of `tail /var/log/nginx/error.log`. | server | — |

Before step 8, snapshot the current state for step 12:
`docker ps --format '{{.Names}} {{.Status}}' | sort > /root/deploy/redactplus-landing/pre-release-ps.txt`.

## Design switch (A ↔ B)

This is a normal release of a different commit. Steps 1–9 and 11 apply, and step 10 doesn't: DNS, Nginx and the certificate stay as they are.

**Design A needs an extra decision. [APPROVAL]**
- `master` (`68b6546`) still publishes product captures that the 2026-10-30 visual audit retired:
  - `format-video.png`: third-party broadcast watermark, identifiable people.
  - `format-audio.png`: unconfirmed source-data provenance, local path visible.
  - `hero-document-review.png`, `format-documents.png`: an earlier dark-theme build.
  - `homepage.png`: legacy branding, test file names, local paths. Packaged, but not referenced.
- The runtime check refuses that image unless it is built with `ALLOW_RETIRED_CAPTURES=true`.
- An image built that way carries the label `io.safaridesk.redactplus.retired-captures=true`.
- The alternative is an approved Design A commit with those captures replaced. That is an application change on its own branch.

## Build host

- **Preferred:** any machine with Docker.
- **Fallback:** the SafariDesk server, which already runs Docker, while no other build host exists. The first release was built this way.
  - Check `df -h /` and `docker system df` first.
  - Ship a `git archive` of the approved commit, never a working tree, into `/tmp/redactplus-build-<sha>/`.
  - Run `build-image.sh`'s `docker build` command from there.
  - Afterwards delete that directory and run `docker builder prune -f`, after confirming the build cache held nothing but this build.

## What never happens

- Building from an uncommitted working tree, or with Docker installed on the server just for building.
- Pinning `latest`, a branch name, or a tag without its digest.
- Watchtower managing this service. The label is `false`, and Watchtower on this host only watches opted-in containers.
- `certbot --nginx` against this site (see DNS-AND-TLS.md).
- Attaching the service to another project's Docker network.

## Raising HSTS (after about two stable weeks)

Change both `max-age=86400` lines in the installed site to `max-age=31536000`, then run `nginx -t && systemctl reload nginx` **[APPROVAL]**.
- Leave `includeSubDomains` and `preload` out unless every redactplus.io subdomain is HTTPS.
- Until HSTS is raised, a DNS rollback to the registrar's parking page (HTTP only) stays reachable.

# Deploying the RedactPlus portal (`home.redactplus.io`)

**Status: files only. Nothing here has been built, installed or deployed.** The validated,
step-by-step sequence with approval gates, the recorded server state and the rollback table are
in [DEPLOYMENT.md](DEPLOYMENT.md). That file supersedes the prerequisites below where they
differ. In particular, the database is now its own `redactplus-portal-db` service in
`compose.yaml`, and DNS is proxied by Cloudflare.

The portal runs as its own container next to the marketing site, on the same pattern:
- an image pinned by tag and digest;
- `compose.yaml` and `app.env` in `/root/deploy/redactplus-portal/`;
- a loopback port (`127.0.0.1:6096`);
- host nginx in front.

The marketing deployment (`deployment/redactplus/`) is unaffected.

## Prerequisites (all outstanding)

1. **Identity provider.** The backend team creates the `redactplus-portal` confidential client
   and confirms the issuer URL (`docs/portal/backend-integration-boundary.md`). Until then,
   leave `PORTAL_OIDC_*` unset: the portal reports sign-in unavailable.
2. **Database.** A Postgres database and user owned by the portal, never the Control Center
   database. Apply `apps/portal/src/lib/session/schema.sql` once.
3. **DNS.** `home.redactplus.io` resolves publicly today but nothing answers. Confirm who
   manages the record, then point it at the host.
4. **Certificate.**
   `certbot certonly --webroot -w /var/www/html -d home.redactplus.io`, after installing only
   the port-80 server block.
5. **nginx.** Install `nginx/home.redactplus.io.conf`, the `limit_req_zone` and `log_format`
   lines from its header, and the proxy snippet. Then run `nginx -t` and reload.
6. **Installer host.** A verified host listed in `PORTAL_DOWNLOAD_ALLOWED_HOSTS`, and a manifest
   entry that passes `releases:verify`.
7. **Disk.** The shared host was at 94% during the last marketing release. Free space before
   adding an image.

## Build and release

```bash
docker build --platform linux/amd64 -f deployment/portal/Dockerfile --build-arg GIT_COMMIT="$(git rev-parse HEAD)" -t registry.safaridesk.io/safari/redactplus-portal:"$(git rev-parse HEAD)" apps/portal
```

Then:
1. Push the image and record its digest.
2. Write `RELEASE_SHA` and `RELEASE_DIGEST` to `.env`, keeping the previous file as
   `.env.previous`.
3. Run `docker compose up -d`.
4. Check that `curl -s http://127.0.0.1:6096/api/health` reports `"status":"ready"`.

The health check fails (`503 misconfigured`) on any production-rule violation:
- an `http` origin or issuer;
- the memory session store;
- a missing secret;
- `PORTAL_ENVIRONMENT` set off loopback.

## Turning on the marketing entry point

The marketing site's Download buttons (header, mobile menu, homepage hero) and their shared
sign-in dialog appear only when the marketing image is built with
`NEXT_PUBLIC_PORTAL_URL=https://home.redactplus.io`. Build it that way only after the portal is
live and sign-in works end to end. Until then those buttons stay "Request a Demo", unchanged.

## Rollback

- **Portal:** restore `.env.previous` to `.env`, then run `docker compose up -d`. Removing the
  container is also safe: the marketing site does not depend on it.
- **Marketing entry point:** rebuild the marketing image without `NEXT_PUBLIC_PORTAL_URL`, or
  redeploy the previous marketing digest.
- **Sessions:** rotating `PORTAL_SESSION_SECRET` signs everyone out, which is safe.
- **Data:** dropping the portal tables loses only sessions and download history. No licence
  data lives here.

## Known limits

- Rate limits are per process. Multiple replicas need a shared limiter.
- Sessions are in Postgres, so replicas can share them.

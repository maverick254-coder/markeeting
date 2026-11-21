# RedactPlus portal: deployment and rollback (`home.redactplus.io`)

**Status, 6 November 2026: prepared and validated, not applied.** The server state below was
recorded read-only. Nothing on the server has been created, changed, reloaded or restarted.

Two markers:
- **[APPROVAL]** marks a step that changes the server. It needs an explicit, recorded go-ahead
  before anyone runs it.
- **[GATE]** marks a step that must not run until its condition is true.

## Coordinates

| | |
|---|---|
| Server | `root@31.97.42.73`, hostname `SafariDesk`: Ubuntu 24.04, nginx 1.24 (realip module built in), Docker 29, Compose v5 |
| Deploy directory | `/root/deploy/redactplus-portal/` (does not exist yet) |
| Image | `registry.safaridesk.io/safari/redactplus-portal:<full-sha>`, pinned by digest |
| Containers | `redactplus-portal` (app) and `redactplus-portal-db` (PostgreSQL 16) |
| Upstream | `127.0.0.1:6096` → container port 3000 (6096 is free) |
| Networks | `redactplus-portal` (app egress) and `redactplus-portal-db` (`internal: true`, app ↔ db only) |
| Volume | `redactplus-portal-db-data` |
| nginx site | `/etc/nginx/sites-available/home.redactplus.io`, symlinked into `sites-enabled` |
| nginx shared files | `conf.d/redactplus-portal-http.conf`, `snippets/redactplus-portal-proxy.conf`; shared with the marketing site: `snippets/cloudflare-real-ip.conf` (`deployment/shared/nginx/`) |
| Certificate | lineage `home.redactplus.io`, Let's Encrypt webroot `/var/www/html` |
| Identity | issuer `https://admin.redactplus.io/identity/realms/saferedact`; client `redactplus-portal`, public with PKCE, **present on the live realm** (6 Nov 2026) |

## Server state at preparation (read-only)

| Item | State |
|---|---|
| Resources | 4 vCPU, load about 1. 15 GiB RAM, about 6.6 GiB available, no swap |
| Disk | **`/` 94% used, 13 GB free.** Docker images 15.2 GB; build cache 0.8 GB reclaimable |
| Port 6096 | Free. No container, network or volume named `redactplus-portal*` |
| nginx | Config tests clean. 11 sites enabled, none for `home.redactplus.io`, no `default_server` |
| Unknown host names | Fall through to the first loaded block, `admin.redactplus.io`. Port 80 redirects to admin; port 443 presents the admin certificate, and Control Center answers 400 "Invalid Hostname". That is what `home.redactplus.io` returns today |
| Cloudflare | Nameservers `riya`/`syeef.ns.cloudflare.com`. `home`, `@`, `www` and `admin` are proxied. Edge HTTP is not forced to HTTPS, so ACME HTTP-01 reaches the origin |
| Cloudflare SSL mode (inferred) | **Full, not Full (strict).** The edge accepted the admin certificate for `home.redactplus.io` |
| Real client IP | No `real_ip` configuration exists on the host. The marketing site logs Cloudflare edge addresses |
| Keycloak | `saferedact_identity` 26.7.1, `KC_HOSTNAME=https://admin.redactplus.io/identity`. On 5 Nov the authorise endpoint answered "Client not found" for `redactplus-portal`; on 6 Nov it renders the sign-in page for it |
| Backups | `/root/deploy/backup-dbs.sh` runs from cron at 02:00 and keeps 3 days. Marketing release baselines and nginx backups are in `/root/deploy/redactplus-landing/` |
| Outbound | SMTPS to `mail.spacemail.com:465` verifies (used by the marketing enquiry mail) |

## What the portal needs

| Need | Provided by |
|---|---|
| Sessions and download history (`portal_sessions`, `portal_download_events`) | PostgreSQL. `memory` is refused in production. Its own container and volume; never the Control Center database |
| Forum and community | Nothing yet. The forum is hidden and 404s while no forum service exists, so it needs no storage |
| Installer files | GitHub Releases (`PORTAL_DOWNLOAD_ALLOWED_HOSTS=github.com`). The portal stores none |
| Secrets | `app.env` and `db.env` (mode 600, root-owned). Never in the image, the repository or this file |

## Staged checklist

Each stage is approved and run on its own, in the order shown. It stops at the first failure,
and its rollback is right below it. The impact review behind this order is in
[CHANGE-IMPACT-REVIEW.md](CHANGE-IMPACT-REVIEW.md).

| Stage | What | Server impact | Public effect | Needs |
|---|---|---|---|---|
| 0 | Validate files on a temp copy | `/tmp` only, deleted | None | Nothing (safe now) |
| A | Directory, secrets, nginx backup | Files in `/root/deploy/redactplus-portal/` | None | Approval A |
| B | Certificate | New certbot lineage; no reload | None | Approval B |
| M | Marketing real-IP change (independent, any time) | One graceful nginx reload | Real visitor addresses in the marketing site | Approval M |
| C | Holding page | One graceful nginx reload | `home.redactplus.io` answers 503 with its own certificate | Approval C |
| D | Cloudflare rules for `home` only | Zone rules scoped to one host | None visible | Approval D + Cloudflare dashboard access |
| E | Disk clean-up | E1 build cache only; E2 registry GC | None | E1: approval. E2: registry owner and all pushing projects |
| F | Database and backups | Container, 2 networks, volume, cron line | None | Approval F (creates a production database) |
| G | Build and push the image | Registry write (~0.3 GB) | None | Approval G, a committed revision |
| H | Portal container on loopback | One container on `127.0.0.1:6096` | None | Approval H |
| H2 | Staff preview | One graceful nginx reload | Staff addresses reach the portal; everyone else still sees the holding page | Approval H2 |
| I | Public launch | One graceful nginx reload | Portal live | H2 test passed, then approval I |
| J | Marketing Download entry point | Marketing image release | Download buttons open the portal dialog | After I passes; normal marketing release |

**Safe now, without approval:** stage 0, and reading anything. **Needs backend-team
coordination:** none for the portal any more (the Keycloak client exists). Stage E2 needs the registry and
SafariDesk owners. Stage D needs whoever holds the Cloudflare account.

### Stage 0. Validate (no change)

```sh
# workstation
ssh root@31.97.42.73 'mkdir -m 700 /tmp/rp-portal-validate && mkdir -p /tmp/rp-portal-validate/src/nginx /tmp/rp-portal-validate/src/shared'
scp deployment/portal/nginx/*.conf root@31.97.42.73:/tmp/rp-portal-validate/src/nginx/
scp deployment/shared/nginx/cloudflare-real-ip.conf root@31.97.42.73:/tmp/rp-portal-validate/src/shared/
scp deployment/portal/{compose.yaml,app.env.example,db.env.example} root@31.97.42.73:/tmp/rp-portal-validate/src/
scp deployment/portal/scripts/validate-config.sh root@31.97.42.73:/tmp/rp-portal-validate/validate.sh
ssh root@31.97.42.73 'sh /tmp/rp-portal-validate/validate.sh'   # deletes /tmp/rp-portal-validate when done
```

Pass: every site variant reports `test is successful`; the only warnings are "protocol options
redefined for 0.0.0.0:443", which existing sites already produce; compose is valid; no name or
port conflicts.

### Stage A. Directory, secrets, backup [APPROVAL A]

```sh
TS=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 /root/deploy/redactplus-portal /root/deploy/redactplus-portal/initdb /root/deploy/redactplus-portal/nginx
cd /root/deploy/redactplus-portal
tar -czf "nginx-backup-$TS.tgz" -C / etc/nginx
{ docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'; ss -ltnH; nginx -t 2>&1; df -h /; } > "pre-deploy-$TS.txt"
# workstation:
#   scp deployment/portal/{compose.yaml,app.env.example,db.env.example,scripts/backup-db.sh} root@31.97.42.73:/root/deploy/redactplus-portal/
#   scp deployment/portal/nginx/*.conf deployment/shared/nginx/cloudflare-real-ip.conf root@31.97.42.73:/root/deploy/redactplus-portal/nginx/
#   scp apps/portal/src/lib/session/schema.sql root@31.97.42.73:/root/deploy/redactplus-portal/initdb/001-portal-schema.sql
install -m 600 db.env.example db.env  && rm db.env.example
install -m 600 app.env.example app.env && rm app.env.example
chmod 700 backup-db.sh
DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-40)
SESSION_SECRET=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=')
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASSWORD|" db.env
sed -i "s|replace-with-the-db-password|$DB_PASSWORD|; s|^PORTAL_SESSION_SECRET=.*|PORTAL_SESSION_SECRET=$SESSION_SECRET|" app.env
unset DB_PASSWORD SESSION_SECRET
grep -c 'replace-with' app.env db.env          # 0 for both
grep -c '^PORTAL_OIDC_CLIENT_SECRET' app.env      # 0: the portal client is public
```

Rollback: `rm -r /root/deploy/redactplus-portal` (nothing else references it yet).

### Stage B. Certificate, no nginx change [APPROVAL B]

The HTTP-01 path already reaches `/var/www/html` through the `admin.redactplus.io` port-80 block
(verified 6 Nov 2026). Issuing with no hook means no reload.

```sh
certbot certonly --webroot -w /var/www/html -d home.redactplus.io --cert-name home.redactplus.io --dry-run
certbot certonly --webroot -w /var/www/html -d home.redactplus.io --cert-name home.redactplus.io
certbot reconfigure --cert-name home.redactplus.io --deploy-hook 'systemctl reload nginx'   # future renewals only
grep -E '^(authenticator|renew_hook)' /etc/letsencrypt/renewal/home.redactplus.io.conf
```

If the dry run fails, run the fallback before retrying:
1. Install `conf.d/redactplus-portal-http.conf`, the two snippets and
   `home.redactplus.io.bootstrap.conf` as in stage C.
2. Reload.
3. Retry.

Let's Encrypt allows 5 failed validations per host per hour.

Rollback: `certbot delete --cert-name home.redactplus.io`. Nothing references the certificate yet.

### Stage M. Marketing real-IP change [APPROVAL M] (independent)

See `deployment/redactplus/nginx/REAL-IP-CHANGE.md`. It is independent of the portal stages and
can come before or after them. It installs the shared `snippets/cloudflare-real-ip.conf`, which
stage C then reuses.

### Stage C. Holding page [APPROVAL C]

```sh
cd /root/deploy/redactplus-portal/nginx
install -m 644 redactplus-portal-http.conf /etc/nginx/conf.d/
install -m 644 redactplus-portal-proxy.conf /etc/nginx/snippets/
test -e /etc/nginx/snippets/cloudflare-real-ip.conf && cmp cloudflare-real-ip.conf /etc/nginx/snippets/cloudflare-real-ip.conf \
  || install -m 644 cloudflare-real-ip.conf /etc/nginx/snippets/
install -m 644 home.redactplus.io.holding.conf /etc/nginx/sites-available/home.redactplus.io
ln -s /etc/nginx/sites-available/home.redactplus.io /etc/nginx/sites-enabled/home.redactplus.io
nginx -t && systemctl reload nginx
curl -s https://home.redactplus.io/            # 503 "not open yet" (through Cloudflare)
curl -sI https://redactplus.io/ | head -1; curl -sI https://admin.redactplus.io/ | head -1   # unchanged
```

Rollback:

```sh
rm /etc/nginx/sites-enabled/home.redactplus.io /etc/nginx/sites-available/home.redactplus.io \
   /etc/nginx/conf.d/redactplus-portal-http.conf /etc/nginx/snippets/redactplus-portal-proxy.conf
nginx -t && systemctl reload nginx
```

Leave `cloudflare-real-ip.conf` if stage M uses it. It is inert unless included.

### Stage D. Cloudflare, `home.redactplus.io` only [APPROVAL D]

In the dashboard for zone `redactplus.io`:
- **Configuration Rule**, hostname equals `home.redactplus.io`: SSL = **Full (strict)**.
- **Cache Rule**, hostname equals `home.redactplus.io` and path does not start with
  `/_next/static/`: **Bypass cache**.
- **Web Analytics**: turn off automatic injection for this host. The portal's nonce CSP blocks it
  anyway.

Do not change the zone-wide SSL mode, DNS or nameservers here.

Check: `curl -sI https://home.redactplus.io/` → 503 (not 526), with `cf-cache-status: DYNAMIC` or
`BYPASS`.

Rollback: delete the rules.

### Stage E. Disk [E1: APPROVAL E1; E2: coordinated]

E1 (no effect on running containers):

```sh
docker builder prune -f      # about 0.8 GB, build cache only
apt-get clean                # about 0.1 GB
```

E2 is registry garbage collection (about 92 GB of untagged manifests). It is not a portal step,
and it needs the registry owner. The plan:
1. Announce a window.
2. Stop pushes and Watchtower.
3. Set `REGISTRY_STORAGE_DELETE_ENABLED=true` and restart the registry.
4. Run `registry garbage-collect --delete-untagged` with the registry read-only.
5. Restart normally.
6. Verify pulls of every image the server runs.

### Stage F. Database and backups [APPROVAL F]

```sh
cd /root/deploy/redactplus-portal
docker compose up -d redactplus-portal-db
docker compose ps                                           # healthy
docker exec redactplus-portal-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"'   # portal_sessions, portal_download_events
./backup-db.sh                                              # first dump in /root/backups/redactplus-portal/
( crontab -l; echo '15 2 * * * /root/deploy/redactplus-portal/backup-db.sh >> /var/log/redactplus-portal-backup.log 2>&1' ) | crontab -
```

Rollback:
- `docker compose down` (keeps the volume), and remove the cron line.
- `docker volume rm redactplus-portal-db-data` is permanent and needs its own approval.

### Stage G. Image [APPROVAL G]

From a committed, approved revision, on a machine with registry access:

```sh
docker build --platform linux/amd64 -f deployment/portal/Dockerfile \
  --build-arg GIT_COMMIT="$(git rev-parse HEAD)" \
  -t registry.safaridesk.io/safari/redactplus-portal:"$(git rev-parse HEAD)" apps/portal
docker push registry.safaridesk.io/safari/redactplus-portal:"$(git rev-parse HEAD)"   # record the digest
```

Build elsewhere than the server while disk is at 94%.

Without a local build machine: with `portal-publish` in the production environment's
`CD_COMPONENTS`, CI builds and publishes the portal image for every push to main that changes a
portal image input, and never deploys. The run's summary ("publish / portal image") gives
`RELEASE_SHA` and `RELEASE_DIGEST` for `.env`; the approval to publish is the merge to main.

### Stage H. Portal on loopback [APPROVAL H]

```sh
cd /root/deploy/redactplus-portal
printf 'RELEASE_SHA=%s\nRELEASE_DIGEST=%s\n' '<full-sha>' 'sha256:<digest>' > .env && chmod 600 .env
docker compose up -d redactplus-portal
docker compose ps                                       # both healthy
curl -s http://127.0.0.1:6096/api/health                # "status":"ready","authentication":"unconfigured","sessionStore":"postgres"
ss -ltnH | grep ':6096'                                 # only 127.0.0.1:6096
echo "$(date -u +%FT%TZ) <full-sha> sha256:<digest> initial-loopback" >> releases.log
```

Rollback: `docker compose rm -sf redactplus-portal`. For a bad release, restore `.env.previous`
to `.env` and run `docker compose up -d redactplus-portal`.

### Stage H2. Staff preview [APPROVAL H2]

The real portal on `home.redactplus.io` for listed staff addresses only. Everyone else still gets
the holding answer, so this is the place for the controlled sign-in and download test before
public launch.

```sh
# 1. List each staff address (the public address the tester's browser comes from):
#    edit /etc/nginx/conf.d/redactplus-portal-http.conf, geo $redactplus_portal_staff:
#        203.0.113.10 1;
install -m 644 /root/deploy/redactplus-portal/nginx/home.redactplus.io.preview.conf /etc/nginx/sites-available/home.redactplus.io
nginx -t && systemctl reload nginx
curl -s https://home.redactplus.io/      # from a non-staff address: 503 "not open yet"
```

**Prerequisite:** stage C, which installs the shared real-IP snippet this file includes. The
staff check then sees the tester's own address, not Cloudflare's.

Then run the portal part of the controlled test in `deployment/ROLLOUT-CHECKLIST.md`.

Rollback: reinstall `home.redactplus.io.holding.conf` and reload. The staff list can stay; only
the preview file reads it.

### Stage I. Public launch [APPROVAL I]

The Keycloak client is no longer a blocker. `redactplus-portal` exists on the live realm: the
public authorize endpoint renders its sign-in page and refuses a foreign redirect URI (checked
6 Nov 2026). It is defined in the Admin Panel realm file (`7026a19`):

| Setting | Value (verified) |
|---|---|
| Client ID | `redactplus-portal`, **public** (no secret), standard flow only |
| PKCE | S256 required |
| Redirect URIs | `https://home.redactplus.io/*` (covers `/auth/callback` and `/welcome`) |
| Post-logout redirect URIs | `https://home.redactplus.io/*` (the portal uses `/signed-out`) |
| Web origins | `https://home.redactplus.io` |
| Direct access grants, implicit flow, service accounts | off |

`app.env` therefore carries `PORTAL_OIDC_ISSUER` and `PORTAL_OIDC_CLIENT_ID` from stage A, and
**no** `PORTAL_OIDC_CLIENT_SECRET`. Narrowing the redirect URIs to the two exact paths is a
recommended hardening for the backend team, not a launch blocker.

**Gate, all of it:**
- `curl -s http://127.0.0.1:6096/api/health` reports `"authentication":"configured"` and
  `"customerApi":"configured"`;
- stage H2 (staff preview) passed the controlled sign-in and download test
  (`deployment/ROLLOUT-CHECKLIST.md`).

Then:

```sh
install -m 644 /root/deploy/redactplus-portal/nginx/home.redactplus.io.conf /etc/nginx/sites-available/home.redactplus.io
nginx -t && systemctl reload nginx
```

Check through Cloudflare:
- `/` without a session redirects to sign-in;
- a staff sign-in, the download redirect to GitHub, and sign-out all work;
- pages carry `Cache-Control: private, no-store`;
- `Set-Cookie: __Host-rp_session…; Secure; HttpOnly; SameSite=Lax`;
- `/forum` and `/dev-fixtures/` are 404;
- a request straight to the origin IP with `Host: home.redactplus.io` gets 403.

Rollback: reinstall `home.redactplus.io.holding.conf` (or the staff preview) and reload.

### Stage J. Marketing entry point

Rebuild the marketing image with `NEXT_PUBLIC_PORTAL_URL=https://home.redactplus.io` only after
stage I passes. This is a normal marketing release (`deployment/redactplus/DEPLOYMENT.md`), and
it rolls back to the previous digest.

## Restoring the database

```sh
cd /root/deploy/redactplus-portal
docker compose stop redactplus-portal
docker exec -i redactplus-portal-db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < /root/backups/redactplus-portal/portal_<timestamp>.dump
docker compose start redactplus-portal
```

## Refreshing Cloudflare ranges

Cloudflare publishes its edge ranges at https://www.cloudflare.com/ips-v4 and `/ips-v6`. When they
change:
1. Regenerate both `cloudflare-real-ip.conf` (`deployment/shared/nginx`, `set_real_ip_from`) and the `geo` block in
   `redactplus-portal-http.conf` from the same fetch.
2. Run step 0.
3. Reinstall both files and reload.

A stale list means visitors on a new Cloudflare range get 403 from the origin check.

## Launch readiness (keep these separate)

| Area | Ready when | 6 Nov 2026 |
|---|---|---|
| Infrastructure | Stages A–D done: cert issued, holding page served under Full (strict); F for the database | Prepared, not applied |
| Portal application deployed | Stage H health is `ready` on loopback | Not built or deployed |
| Authentication | Stage H2 staff sign-in passes | Unblocked: public client present on the live realm; not yet exercised end to end |
| Registration | Website registration backend live (separate) | Not live; the site shows Contact Sales |
| Installer download | Signed-in download redirects to the verified v0.3.8 asset | Works in local verification; needs stage I |
| Forum | A real forum service exists | Not available; hidden and 404 |

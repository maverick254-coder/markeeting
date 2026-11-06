# Portal infrastructure: change-impact review

Prepared 6 November 2026 from read-only inspection of `root@31.97.42.73`. Nothing on the server
was changed.

Validation ran on a temporary copy of `/etc/nginx` under `/tmp`, deleted afterwards. A
throwaway nginx served 127.0.0.1:18081–18082 only, to demonstrate the real-IP rule, and was
stopped.

The staged checklist this review feeds is in [DEPLOYMENT.md](DEPLOYMENT.md). The port-exposure
findings are kept out of the repository (see [Port exposure](#port-exposure)).

## 1. The original steps 1–7, classified

Impact levels:
- **Additive**: creates files or resources nothing else uses.
- **Live**: changes the running configuration of a shared service.
- **Interrupting**: could stop or degrade an existing application.

| Step | Exact actions | Impact | Can it interrupt others? |
|---|---|---|---|
| 1 Baseline | Write `pre-deploy-<ts>.txt` and `nginx-backup-<ts>.tgz` (about 100 KB) in `/root/deploy/redactplus-portal/` | Additive | No |
| 2 Disk | Free space (pruning) | Shared resources | **Yes, if mis-targeted.** Moved out to its own coordinated stage (§3) |
| 3 Directory and secrets | Create `/root/deploy/redactplus-portal/` (700); copy compose, env templates, schema and scripts; generate `db.env` and `app.env` (600) | Additive | No |
| 4 Database | `docker compose up -d redactplus-portal-db`: one container, two networks (`10.0.x.0/24` from the existing pool, 4 of about 65,000 used), one volume; a root crontab line | Additive, but **creates a production database** | No. Memory capped at 256 MB, CPU at 0.5 |
| 5 nginx bootstrap | Install `conf.d/redactplus-portal-http.conf`, two snippets, the site file; `nginx -t`; **graceful reload** | **Live** (nginx reload) | Practically no; see below |
| 6 Certificate and holding page | `certbot certonly --webroot` (new lineage; temporary file in the shared webroot); install the holding site; **graceful reload** | Certificate additive; reload **live** | Practically no |
| 7 Cloudflare | Dashboard: a Configuration Rule and a Cache Rule scoped to `home.redactplus.io` | **Live** (zone configuration) | Only if applied zone-wide instead of per host |

**What a graceful reload does.** It starts new workers with the new configuration while old
workers finish their requests:
- No listener closes. `worker_shutdown_timeout` is not set, so open WebSockets (Chatwoot,
  SafariDesk channels and others) stay on the old workers until they close on their own.
- A configuration that fails `nginx -t` is never loaded; the running one continues.
- This host reloaded 16 times between 1 October and 6 November 2026.

**The revised plan needs fewer live changes:**
- The certificate can be issued **before** any nginx change. The HTTP-01 path for
  `home.redactplus.io` already reaches the shared webroot through the `admin.redactplus.io`
  port-80 block (verified: 404, not a redirect). The bootstrap site and its reload become a
  fallback only.
- The portal then needs **one** reload to go to the holding page, and **one** more at public
  launch.

## 2. What can be prepared while `home.redactplus.io` stays closed

| Can be done | Public effect |
|---|---|
| Stage A: directory, files, generated secrets, nginx backup | None |
| Stage B: certificate | None. No nginx file references it yet |
| Stage C: holding page (one reload) | The name answers `503 not open yet` with its own certificate, instead of admin's certificate and a 400 |
| Stage D: Cloudflare rules | None visible; it makes later stages safe |
| Stage F: database and backups | None (internal network, no port) |
| Stage G: build and push the image | None |
| Stage H: portal container on `127.0.0.1:6096` | None. nginx still serves the holding page; the port is loopback-only and was confirmed closed from outside |

Only Stage I (gated on the Keycloak client) makes the portal public. Even then:
- the origin answers 403 to any request that does not come from Cloudflare;
- every page requires sign-in.

## 3. Disk (94% used, 13 GB free)

| Location | Size | Owner | Note |
|---|---|---|---|
| `/root/deploy/docker-registry/registry/data` | **153 GB** | Private registry, shared by all projects | 15,520 blobs; 4,000+ manifest revisions |
| `/var/lib/docker` | 20 GB | Docker | 45 images, all used by a container; volumes 1.8 GB |
| `/root/pgloader` | 1.1 GB | Unknown | Ask its owner |
| `/root/backups` | 0.9 GB | Database backups | Keep |
| Everything else | under 1 GB each | | Journal 61 MB, apt cache 125 MB, `/var/log` 206 MB |

A read-only dry run of the registry's garbage collector (`registry garbage-collect --dry-run`,
distribution 3.0.0) found:
- **plain GC**: 21 blobs, about 0 GB (delete is not enabled, so almost nothing is unreferenced);
- **`--delete-untagged`**: 2,262 untagged manifests and 8,077 blobs, about **92 GB**.

Safe cleanup, in order of risk:

| Action | Frees | Risk | Who decides |
|---|---|---|---|
| `docker builder prune` | 0.8 GB | None to running containers; only rebuilds lose cache | Stage E1, can be approved alone |
| `apt-get clean` | 0.1 GB | None | Same |
| Registry GC with `--delete-untagged` | about 92 GB | See below | **Registry owner and every project that pushes to it** |
| A tag-retention policy (for example, keep the last 10 tags per repository) | More: several repositories hold 100+ tags | Removes rollback targets | Each project's owner |

**Registry GC risks:**
- It needs `REGISTRY_STORAGE_DELETE_ENABLED=true` and a registry restart, which briefly stops all
  pushes and pulls, including Watchtower's polls.
- It must run with the registry stopped or read-only, so no push lands mid-collection.
- An image referenced only by digest, never by tag, would be deleted. Running containers are
  unaffected because they use local copies, but a re-pull of such a digest would fail.

**Not proposed:** deleting volumes, databases, images in use, `/root/backups`, or any project's
files. The 13 GB free is enough for the portal (image about 0.3 GB, database under 100 MB). The
registry clean-up is still worth scheduling soon: each release pushes more.

## 4. Port exposure

Kept out of the repository because it lists exploitable details:
`docs/security/2026-11-06-port-exposure.private.md`, which `.gitignore` excludes. Share it with
the SafariDesk service owners directly.

## 5. Marketing real-IP fix

A separate change, `deployment/redactplus/nginx/REAL-IP-CHANGE.md`: one shared snippet, and
seven added lines (one `include` plus comments) in the apex block. Validated alone and together
with every portal stage.

The throwaway-nginx demonstration showed:
- a forged `CF-Connecting-IP` from a non-Cloudflare peer is **ignored**
  (`remote_addr=127.0.0.1`);
- from a trusted peer the header is used (`remote_addr=203.0.113.9`).

## 6. Effect on existing services

| Service | Effect of the portal configuration | Evidence |
|---|---|---|
| nginx, all existing sites | None beyond the reload. No listener, port, `default_server` or existing file changes. New names are prefixed `redactplus_portal_`; `real_ip` is server-scoped | `nginx -t` on full-config copies passed with the bootstrap, holding and final sites, alone and with the marketing change. The only warnings are the pre-existing "protocol options redefined" kind |
| Unknown host names | Unchanged: still answered by `admin.redactplus.io` on 80 and 443 | Load-order check on live and changed copies |
| Marketing site (`redactplus.io`, 6095) | None from the portal. Its own real-IP change is separate and optional | The vhost is not touched by portal stages |
| Admin panel and Keycloak (8110–8113) | None. The portal is a client of Keycloak's public endpoints, adding sign-in traffic only after Stage I | No Keycloak or Control Center file or container is touched |
| Other Docker projects | None. Own project name, networks, volume, port 6096 (free) and Watchtower opt-out | Compose parsed on the host; no name collisions |
| Docker address pool | Two more `/24` networks from `10.0.0.0/8` | 23 networks exist |
| Memory and CPU | At most 384 MB and 0.75 CPU (app) plus 256 MB and 0.5 CPU (db) | 6.6 GiB available, load about 1 on 4 vCPU |
| Certbot | A new lineage and renewal file; the shared webroot is used the same way as now | Existing lineages use webroot plus `systemctl reload nginx` |
| Root crontab | One added line (portal backup at 02:15) | Existing 02:00 database backup unchanged |

## 7. Certificate and Full (strict)

Verified now:
- Cloudflare does **not** force HTTP to HTTPS for this host (the origin's own 301 came through),
  so HTTP-01 reaches the origin.
- `/.well-known/acme-challenge/<random>` on `home.redactplus.io` returns 404 through Cloudflare
  from a webroot-serving block, so issuance works before any nginx change.
- Origin certificates for `redactplus.io`, `www` and `admin` verify against the system trust
  store with hostname checks (`Verify return code: 0`), which is what Full (strict) requires.
- The zone today is effectively **Full, not strict**: Cloudflare accepted the admin certificate
  for `home.redactplus.io`. No other common subdomain resolves.
- Existing lineages renew by webroot with `renew_hook = systemctl reload nginx`. Certbot 2.9.0.

Strategy:
1. Issue `home.redactplus.io` with webroot and **no hook**, so issuing causes no reload.
2. Then add the renewal hook to that lineage only (`certbot reconfigure`).
3. Switch **only** `home.redactplus.io` to Full (strict) with a Configuration Rule, after the
   holding page serves the new certificate. Check for no 526.
4. Move the whole zone to Full (strict) later, as its own change, once the Cloudflare DNS list
   confirms every proxied host has a valid origin certificate.

Fallback if HTTP-01 fails: install the bootstrap site (one reload) and retry. If Cloudflare ever
forces HTTPS, use a Cloudflare Origin CA certificate instead. That needs dashboard access.

Unrelated, on the same certbot: one lineage on this host uses the manual plugin and fails every
renewal run ("All renewals failed" in the log), though the other lineages are unaffected.

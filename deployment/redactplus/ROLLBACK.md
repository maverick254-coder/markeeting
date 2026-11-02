# RedactPlus rollback

Each layer rolls back on its own, and none of them needs a Git change.
- The deployed design is whatever commit the pinned image was built from.
- History stays as it is. A different commit is simply pinned.

Every rollback is a production change. **[APPROVAL]** applies, as for a release.

## What is kept for rollback

| Layer | Kept where | Kept by |
|---|---|---|
| Image | Registry tags `<sha>`, plus the images still on the server | Never overwrite a SHA tag; don't prune the previous release's image |
| Release pin | `/root/deploy/redactplus-landing/.env.previous`, `releases.log` | DEPLOYMENT.md step 7 |
| Compose file | `compose.yaml.bak-<UTC timestamp>` beside it | Copy before editing: `cp compose.yaml compose.yaml.bak-$(date -u +%Y%m%dT%H%M%SZ)` (same convention as `/root/deploy/saferedact`) |
| Runtime settings | `app.env.bak-<UTC timestamp>` (mode 600) | Copy before editing |
| Nginx | `/etc/nginx/sites-available/redactplus.io.bak-<timestamp>`, kept outside `sites-enabled` | Copy before editing |
| DNS | DNS-AND-TLS.md records the pre-change state (two parking A records, no `www`) | — |

## 1. Application: previous image (most common)

```bash
cd /root/deploy/redactplus-landing
cp .env .env.failed && cp .env.previous .env
docker compose config --quiet && docker compose up -d
docker compose ps                                   # healthy
curl -s http://127.0.0.1:6095/api/health            # commitSha = previous release
echo "$(date -u +%FT%TZ) ROLLBACK to $(grep RELEASE_SHA .env)" >> releases.log
```

- No pull is needed while the previous image is still on the host.
- If it has been pruned, `docker compose up -d` pulls it by digest.
- To pin any older release, copy its SHA and digest from `releases.log` into `.env`.

## 2. Compose or runtime settings

```bash
cp compose.yaml.bak-<timestamp> compose.yaml        # and/or app.env.bak-<timestamp> app.env
docker compose config --quiet && docker compose up -d
```

## 3. Nginx

- **Return to the previous site configuration:**
  ```bash
  cp /etc/nginx/sites-available/redactplus.io.bak-<timestamp> /etc/nginx/sites-available/redactplus.io
  nginx -t && systemctl reload nginx
  ```
- **Take the site off entirely.** The container keeps running; only the public path goes away:
  ```bash
  rm /etc/nginx/sites-enabled/redactplus.io
  nginx -t && systemctl reload nginx
  ```

`nginx -t` must pass before every reload. A failing test leaves the running configuration as it was, so other sites are never affected.

## 4. DNS

Restore Spaceship parking (or the two A records `34.216.117.25` and `54.149.79.189`, TTL 300) and delete `www`. Effective within about 5 minutes for most resolvers. While HSTS is at one day, browsers that already visited may refuse the plain-HTTP parking page for up to a day.

## 5. Removing the service completely

```bash
cd /root/deploy/redactplus-landing && docker compose down    # keeps the image-cache volume
```

Delete the Nginx symlink as in section 3. The certificate lineage can stay; `certbot delete --cert-name redactplus.io` removes it when it's no longer wanted. `docker compose down` touches only this project's container and network.

# redactplus.io: DNS plan and certificate issuance

## Live DNS (read-only check, 2026-11-02)

Nameservers are `launch1.spaceship.net` and `launch2.spaceship.net` (Spaceship). SOA serial is 1793637595.

| Name | Type | Current value | TTL | Purpose |
|---|---|---|---|---|
| `redactplus.io` | A | `34.216.117.25` | 300 | Spaceship parking page (AWS us-west-2; serves "Parking Page") |
| `redactplus.io` | A | `54.149.79.189` | 300 | Same parking page, second address |
| `redactplus.io` | AAAA, CNAME, MX, TXT, CAA | none | — | — |
| `www.redactplus.io` | any | NXDOMAIN | — | — |
| `_dmarc`, `default._domainkey`, `_acme-challenge` | TXT | NXDOMAIN | — | — |

There are no mail, SPF, DKIM, DMARC or verification records, so nothing for email needs preserving. The only records replaced are the two parking A records.

## Target records

| Name | Type | Value | TTL |
|---|---|---|---|
| `redactplus.io` (`@`) | A | `31.97.42.73` | 300 during cut-over, then 3600 |
| `www.redactplus.io` | A | `31.97.42.73` | 300 during cut-over, then 3600 |

- **Remove** both parking A records. In Spaceship, turn off domain parking or forwarding for the domain, so the parking records aren't re-added.
- **No AAAA.**
  - The server has IPv6, but every existing Nginx site listens on IPv4 only, and so do these templates.
  - An AAAA record would send IPv6 clients somewhere that doesn't answer for this name.
  - Adding IPv6 later means `listen [::]:80;` and `listen [::]:443 ssl http2;` plus an AAAA record, as a separate change.
- **`www` is an A record, not a CNAME,** so both names change together and nothing depends on the apex flattening.
- **Optional CAA:** `redactplus.io CAA 0 issue "letsencrypt.org"`. It restricts issuance to the CA in use. Add it only if no other CA will ever be needed.
- **Email (decision, not a default).** The domain sends no mail today. If it never will, `TXT "v=spf1 -all"` and `_dmarc TXT "v=DMARC1; p=reject"` stop spoofing. If enquiries will be sent *from* a redactplus.io address (`LEAD_DELIVERY_FROM`), set up the provider's SPF and DKIM instead.

### Propagation

- Resolvers that cached the parking records drop them within the current 300-second TTL.
- `www` has no record yet, but resolvers may have cached the NXDOMAIN for up to the SOA minimum, 3600 s.
- Check progress with:
  ```bash
  dig +short redactplus.io A @launch1.spaceship.net
  ```
  ```bash
  dig +short www.redactplus.io A @1.1.1.1
  ```
  Repeat the second command with `@8.8.8.8`. Proceed once every resolver answers `31.97.42.73` only.

### DNS rollback

Restore the two parking A records with TTL 300, or turn parking back on, and delete `www`. Clients return to the parking page within about 5 minutes. Keep HSTS at one day until the site is stable, so a rollback doesn't strand visitors.

## Certificate

**Approach:** `certbot certonly --webroot` with its own lineage, `redactplus.io`.
- `certonly` installs nothing, so Certbot never edits an Nginx file.
- The `/var/www/html` webroot matches the existing `saferedact` site's ACME convention.
- No existing lineage is touched. There are 14 on this host, with mixed authenticators, and none is named redactplus.
- **Do not run `certbot --nginx` against this site.** It rewrites whichever server block matches and adds its own redirect, which would conflict with the reviewed templates.

### 1. Required DNS state

Both names must resolve to `31.97.42.73` from public resolvers (above), and the parking records must be gone. Let's Encrypt validates from several vantage points, so a half-propagated change can fail validation.

### 2. HTTP challenge reachability

- Port 80 must be open. On this host ufw is inactive, and the existing sites already answer on 80.
- Install the bootstrap site, then confirm the path is served:
  ```bash
  install -m 644 nginx/redactplus.io.bootstrap.conf /etc/nginx/sites-available/redactplus.io
  ln -s /etc/nginx/sites-available/redactplus.io /etc/nginx/sites-enabled/redactplus.io
  nginx -t && systemctl reload nginx                       # [APPROVAL]
  mkdir -p /var/www/html/.well-known/acme-challenge
  echo ok > /var/www/html/.well-known/acme-challenge/redactplus-probe
  curl -s http://redactplus.io/.well-known/acme-challenge/redactplus-probe      # must print ok
  curl -s http://www.redactplus.io/.well-known/acme-challenge/redactplus-probe  # must print ok
  curl -s -o /dev/null -w '%{http_code}\n' http://redactplus.io/                # 503 (bootstrap)
  rm /var/www/html/.well-known/acme-challenge/redactplus-probe
  ```
- `nginx -t` must pass before any reload. If it fails, remove the symlink. Nothing else has changed.

### 3. Safe bootstrap configuration

`redactplus.io.bootstrap.conf`:
- Port 80 only, exact `server_name`, no `default_server`.
- No certificate paths.
- Serves the challenge directory; everything else returns 503.

There is no `default_server` anywhere in the current configuration. The implicit default stays with the first file loaded (`chatwoot.conf`), and `redactplus.io` sorts after it, so this site never answers for other hosts.

### 4. Issuance

Rehearse against the staging CA first. It writes nothing to the live lineage:

```bash
certbot certonly --dry-run --webroot -w /var/www/html \
  --cert-name redactplus.io -d redactplus.io -d www.redactplus.io
```

Then issue for real. **[APPROVAL]**

```bash
certbot certonly --webroot -w /var/www/html \
  --cert-name redactplus.io -d redactplus.io -d www.redactplus.io \
  --deploy-hook "systemctl reload nginx"
```

`--deploy-hook` is saved in `/etc/letsencrypt/renewal/redactplus.io.conf`, so it applies only to this lineage. The global `renewal-hooks/` directories, which are empty today, stay untouched. Without the hook, a renewed certificate would sit unused until something else reloaded Nginx.

### 5. HTTPS validation

```bash
install -m 644 nginx/redactplus.io.conf /etc/nginx/sites-available/redactplus.io
nginx -t && systemctl reload nginx                                     # [APPROVAL]
curl -sI https://redactplus.io/ | grep -iE '^(HTTP|content-security-policy|strict-transport|x-content-type|x-powered-by)'
curl -sI https://www.redactplus.io/ | grep -iE '^(HTTP|location)'      # 301 → https://redactplus.io/
curl -sI http://redactplus.io/      | grep -iE '^(HTTP|location)'      # 301 → https://redactplus.io/
openssl s_client -connect redactplus.io:443 -servername www.redactplus.io </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName -enddate
```

The container must already be healthy on `127.0.0.1:6095` (DEPLOYMENT.md step 9) before the final site is enabled. Otherwise visitors get a 502.

### 6. Renewal verification

```bash
certbot renew --cert-name redactplus.io --dry-run --no-random-sleep-on-renew
grep -E '^(authenticator|webroot_path|deploy_hook|renew_hook)' /etc/letsencrypt/renewal/redactplus.io.conf
systemctl list-timers certbot.timer
```

Without `--no-random-sleep-on-renew`, a non-interactive `renew` waits a random delay of up to several minutes before contacting the CA, which looks like a hang over SSH.

Renewal works because the final site's port-80 block keeps serving `/.well-known/acme-challenge/` from the same webroot. Other lineages on this host have known renewal problems. `--cert-name` keeps these commands scoped to this one.

### 7. If issuance fails

- Nothing references the missing certificate, because the bootstrap site has no TLS block. Read `/var/log/letsencrypt/letsencrypt.log`. The usual causes are DNS not yet propagated, a stale AAAA or parking record, or the challenge path not being served.
- **Back out completely:**
  ```bash
  rm /etc/nginx/sites-enabled/redactplus.io
  nginx -t && systemctl reload nginx
  ```
  Then restore DNS (above).
- **If a partial lineage was created:**
  ```bash
  certbot delete --cert-name redactplus.io
  ```
  This affects only that lineage.
- **Rate limits:** Let's Encrypt allows 5 failed validations per hostname per hour. Always run `--dry-run` first.

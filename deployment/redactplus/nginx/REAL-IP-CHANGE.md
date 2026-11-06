# redactplus.io: Cloudflare real client address (separate change)

**Status: prepared and validated with `nginx -t` on a temporary copy, 6 November 2026. Not applied.**

## Problem

`redactplus.io` is proxied by Cloudflare, so nginx sees Cloudflare's edge servers as the client.
On 6 November 2026 the access log held only Cloudflare edge addresses (`172.64.0.0/13`,
`104.16.0.0/13` and others).

The application keys its enquiry rate limit (5 per 10 minutes) on the address nginx passes in
`X-Forwarded-For`. As a result:
- every visitor routed through the same Cloudflare edge shares one quota, so real visitors can
  get "Too many enquiries";
- abuse from one address cannot be told apart from everyone else.

## Change

Two files, and nothing else.

1. **Add the shared snippet** `/etc/nginx/snippets/cloudflare-real-ip.conf`, a copy of
   `deployment/shared/nginx/cloudflare-real-ip.conf`. It changes nothing on its own: it applies
   only where a server block includes it.
2. **Add one line** to `/etc/nginx/sites-available/redactplus.io`, in the apex HTTPS block
   (`server_name redactplus.io;` on 443) only:

   ```nginx
   include /etc/nginx/snippets/cloudflare-real-ip.conf;
   ```

The repository copy, `deployment/redactplus/nginx/redactplus.io.conf`, already has this line. It
was identical to the live file before the change.

The port-80 block and the `www` block only redirect and never reach the application, so they stay
as they are.

### What it does

- **Visitor address.** When the TCP peer is in Cloudflare's published ranges, nginx takes the
  visitor address from `CF-Connecting-IP` (`real_ip_recursive off`). A request that reaches the
  origin directly keeps its real peer address, so a forged `CF-Connecting-IP` is ignored.
- **Rate limit.** The existing `proxy_set_header X-Forwarded-For $remote_addr` then carries the
  visitor's address. With `TRUST_PROXY_HOPS=1` the rate limit becomes per visitor. No
  application change and no new image are needed.
- **Logs.** `redactplus.access.log` records visitor addresses instead of Cloudflare's. These are
  personal data, already covered by the existing nginx log rotation.

### What it does not touch

- Other virtual hosts, including `admin.redactplus.io`, Keycloak and the SafariDesk sites:
  `real_ip` directives are server-scoped, and no other block includes the snippet.
- Listeners, `default_server`, certificates, the container and `app.env`.

## Apply (needs approval; one graceful reload)

```sh
TS=$(date -u +%Y%m%dT%H%M%SZ)
cp -a /etc/nginx/sites-available/redactplus.io /root/deploy/redactplus-landing/nginx-redactplus.io.bak-$TS
# from the workstation:
#   scp deployment/shared/nginx/cloudflare-real-ip.conf root@31.97.42.73:/root/deploy/redactplus-landing/
#   scp deployment/redactplus/nginx/redactplus.io.conf  root@31.97.42.73:/root/deploy/redactplus-landing/redactplus.io.conf.new
install -m 644 /root/deploy/redactplus-landing/cloudflare-real-ip.conf /etc/nginx/snippets/cloudflare-real-ip.conf
diff /etc/nginx/sites-available/redactplus.io /root/deploy/redactplus-landing/redactplus.io.conf.new   # only the comment and include lines
install -m 644 /root/deploy/redactplus-landing/redactplus.io.conf.new /etc/nginx/sites-available/redactplus.io
nginx -t && systemctl reload nginx
echo "$(date -u +%FT%TZ) config-change cloudflare-real-ip (image unchanged) nginx-redactplus.io.bak-$TS" >> /root/deploy/redactplus-landing/releases.log
```

If `nginx -t` fails, stop and do not reload. The running nginx keeps its current configuration.

## Verify

1. `curl -sI https://redactplus.io/` returns 200, through Cloudflare.
2. Load a page in a browser. Then
   `tail -n 5 /var/log/nginx/redactplus.access.log | awk '{print $1}'` shows your own public
   address, not a `104.x` or `172.6x` Cloudflare address.
3. `curl -s http://127.0.0.1:6095/api/health` still reports `"status":"ready"`.

## Rollback

```sh
cp -a /root/deploy/redactplus-landing/nginx-redactplus.io.bak-<TS> /etc/nginx/sites-available/redactplus.io
nginx -t && systemctl reload nginx
```

The snippet can stay installed: it is inert unless included.

## Keeping the ranges current

Cloudflare publishes its ranges at https://www.cloudflare.com/ips-v4 and `/ips-v6`. If a range
is added and the snippet is not updated, visitors on that range are treated as Cloudflare's
address again: rate limits are shared, but nothing breaks. The portal's origin check is stricter;
see `deployment/portal/DEPLOYMENT.md`.

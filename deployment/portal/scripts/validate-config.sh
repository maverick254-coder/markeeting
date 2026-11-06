#!/bin/sh
# deployment/portal/scripts/validate-config.sh
# Copy deployment/portal/{nginx/*.conf,compose.yaml,app.env.example,db.env.example} to
# /tmp/rp-portal-validate/src/ on the server (nginx files under src/nginx/) and
# deployment/shared/nginx/cloudflare-real-ip.conf to src/shared/, then run this.
#
# Validates the portal nginx and Compose files on the server WITHOUT touching the running
# configuration: everything happens in a temporary copy that is deleted at the end.
# Reads /etc/nginx; writes only under $T. Runs `nginx -t` (test mode, never reloads) and
# `docker compose config` (parse only, creates nothing).
set -u
umask 077
T=/tmp/rp-portal-validate
S=$T/src
trap 'rm -rf "$T"' EXIT

build_tree() { # $1 = site file to enable
  rm -rf "$T/nginx"; mkdir -p "$T/nginx/conf.d" "$T/nginx/sites-enabled" "$T/nginx/snippets" "$T/logs"
  sed -e "s#include /etc/nginx/conf.d/\*.conf;#include $T/nginx/conf.d/*.conf;#" \
      -e "s#include /etc/nginx/sites-enabled/\*;#include $T/nginx/sites-enabled/*;#" \
      -e "s#^pid .*#pid $T/nginx.pid;#" /etc/nginx/nginx.conf > "$T/nginx/nginx.conf"
  cp -P /etc/nginx/conf.d/*.conf "$T/nginx/conf.d/" 2>/dev/null || true
  cp -P /etc/nginx/sites-enabled/* "$T/nginx/sites-enabled/"
  cp "$S/nginx/redactplus-portal-http.conf" "$T/nginx/conf.d/"
  cp "$S/nginx/redactplus-portal-proxy.conf" "$S/shared/cloudflare-real-ip.conf" "$T/nginx/snippets/"
  # Same file, with paths moved into the copy. The certificate does not exist yet, so the
  # test uses the host's snakeoil pair purely to let nginx load the TLS block.
  sed -e "s#/etc/nginx/snippets/#$T/nginx/snippets/#g" \
      -e "s#/var/log/nginx/#$T/logs/#g" \
      -e "s#/etc/letsencrypt/live/home.redactplus.io/fullchain.pem#/etc/ssl/certs/ssl-cert-snakeoil.pem#" \
      -e "s#/etc/letsencrypt/live/home.redactplus.io/privkey.pem#/etc/ssl/private/ssl-cert-snakeoil.key#" \
      "$S/nginx/$1" > "$T/nginx/sites-enabled/home.redactplus.io"
}

for site in home.redactplus.io.bootstrap.conf home.redactplus.io.holding.conf home.redactplus.io.preview.conf home.redactplus.io.conf; do
  build_tree "$site"
  echo "== nginx -t with $site"
  nginx -t -c "$T/nginx/nginx.conf" 2>&1 | sed "s#$T#<tmp>#g"
  echo "== warnings mentioning home.redactplus.io or the new names:"
  nginx -t -c "$T/nginx/nginx.conf" 2>&1 | grep -iE 'home\.redactplus|redactplus_portal|conflicting' || echo "(none)"
done

echo "== same check against the live configuration (unchanged), for comparison"
nginx -t 2>&1 | tail -1

echo "== docker compose config (parse only, placeholder values)"
mkdir -p "$T/compose/initdb"
cp "$S/compose.yaml" "$T/compose/"
printf 'RELEASE_SHA=%s\nRELEASE_DIGEST=sha256:%s\n' "$(printf '0%.0s' $(seq 40))" "$(printf '0%.0s' $(seq 64))" > "$T/compose/.env"
cp "$S/app.env.example" "$T/compose/app.env"
cp "$S/db.env.example" "$T/compose/db.env"
docker compose --project-directory "$T/compose" -f "$T/compose/compose.yaml" config --quiet && echo "compose: valid"
docker compose --project-directory "$T/compose" -f "$T/compose/compose.yaml" config --format json \
  | python3 -c 'import json,sys; c=json.load(sys.stdin); [print(n, "ports:", [p.get("host_ip","*")+":"+str(p.get("published")) for p in s.get("ports",[])], "networks:", sorted(s.get("networks",{}).keys())) for n,s in c["services"].items()]; print("internal networks:", [n for n,v in c["networks"].items() if v.get("internal")]); print("volumes:", [v.get("name") for v in c["volumes"].values()])'

echo "== name and port conflicts on the host"
docker ps -a --format '{{.Names}}' | grep -xE 'redactplus-portal|redactplus-portal-db' || echo "no container named redactplus-portal(-db)"
docker network ls --format '{{.Name}}' | grep -xE 'redactplus-portal|redactplus-portal-db' || echo "no network named redactplus-portal(-db)"
docker volume ls --format '{{.Name}}' | grep -x 'redactplus-portal-db-data' || echo "no volume redactplus-portal-db-data"
ss -ltnH | awk '{print $4}' | grep -E ':6096$' || echo "port 6096 free"

# CMS GitHub login (Decap at /admin)

Turning on "Login with GitHub" at `https://redactplus.io/admin` needs three pieces:

1. **The login broker** (`services/cms-oauth-broker`) running at `https://cms-auth.redactplus.io`.
   It holds the GitHub OAuth App secret, does the code exchange, and admits only listed
   staff who can push to the repository. This folder deploys it.
2. **A GitHub OAuth App** whose callback is the broker.
3. **The marketing site's CMS settings** in its `app.env`, which switch `/admin` from the
   "Content Studio isn't enabled" notice to the Decap editor.

Nothing here is applied automatically; the deploy pipeline reports a change to this folder as
a manual server change. Steps marked **[you]** need a person with the right access; the rest
can be run by whoever deploys.

| | |
|---|---|
| Login origin | `https://cms-auth.redactplus.io` |
| Deploy directory | `/root/deploy/redactplus-cms-oauth/` (`compose.yaml`, `broker.env`, `app/`) |
| Container | `redactplus-cms-oauth`, `127.0.0.1:6097` → `8787` |
| nginx site | `/etc/nginx/sites-available/cms-auth.redactplus.io` |
| Scope | `repo` (the repository is private; `public_repo` cannot write to it) |

## How publishing works once it is on

Decap's editorial workflow saves each post as a branch and a pull request on
`Safe-Redact/Marketing-Site`. **Publish** merges that pull request into `main`. Posts are built
into the marketing image, so a published post is live only after the next release: the merge
to `main` makes CI publish a new image (`marketing-publish`), and the server deploy is the
usual manual step (`deployment/redactplus/DEPLOYMENT.md`).

Every editor needs push access, and Publish merges with the editor's own GitHub token, so
**protect `main`** (step 1) or Publish skips review.

## One-time setup

1. **[you] Protect `main`** (repository Settings → Branches): require a pull request with at
   least one approval and the CI checks. Editors can then save and propose, but publishing
   waits for review.

2. **[you] Staff IDs.** For each editor, their numeric GitHub ID (not the login):
   `curl -s https://api.github.com/users/LOGIN | grep '"id"'`. Each must also have write access
   to the repository.

3. **[you] DNS.** Add `cms-auth.redactplus.io` → `31.97.42.73` the same way as
   `redactplus.io` (Spaceship; proxied through Cloudflare if `redactplus.io` is).

4. **[you] GitHub OAuth App** (Safe-Redact organisation → Settings → Developer settings →
   OAuth Apps → New):
   - Homepage URL `https://redactplus.io`
   - Authorization callback URL `https://cms-auth.redactplus.io/callback` (the only one)
   - leave device flow off

   Generate a client secret. Put the client ID and secret straight into `broker.env` on the
   server (step 6); never into chat, tickets or the repository. If the organisation restricts
   OAuth App access, approve the app for `Safe-Redact`.

   The broker accepts only expiring user tokens (`expires_in`, at most a day). If the first
   login answers "Authentication failed" and the broker log shows `oauth.callback` `failed`,
   check the app issues expiring tokens before anything else.

5. **Certificate and nginx** (server):
   ```sh
   cp cms-auth.redactplus.io.bootstrap.conf /etc/nginx/sites-available/cms-auth.redactplus.io
   ln -s /etc/nginx/sites-available/cms-auth.redactplus.io /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot certonly --webroot -w /var/www/html -d cms-auth.redactplus.io
   cp cms-auth.redactplus.io.conf /etc/nginx/sites-available/cms-auth.redactplus.io
   nginx -t && systemctl reload nginx
   ```

6. **Broker** (export on your machine, run on the server):
   ```sh
   # from the repository root, on the commit that is on main
   bash deployment/cms-oauth/package-broker.sh origin/main broker.tar
   scp broker.tar deployment/cms-oauth/compose.yaml root@31.97.42.73:/root/deploy/redactplus-cms-oauth/
   ```
   ```sh
   cd /root/deploy/redactplus-cms-oauth
   tar -xf broker.tar && rm broker.tar && cat app/REVISION
   cp /path/to/broker.env.example broker.env && chmod 600 broker.env   # then fill it in
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"  # OAUTH_STATE_SECRET
   docker compose config --quiet && docker compose up -d
   docker compose ps                          # healthy
   curl -s http://127.0.0.1:6097/health        # ok
   curl -s https://cms-auth.redactplus.io/health
   ```
   A configuration mistake stops the container at start with "configuration is incomplete or
   invalid" and no values in the log; fix `broker.env` and `docker compose up -d` again.

7. **Marketing site** — add to `/root/deploy/redactplus-landing/app.env`, replacing
   `CMS_ENABLED=false`:
   ```
   CMS_ENABLED=true
   PUBLIC_SITE_ORIGIN=https://redactplus.io
   CMS_OAUTH_PUBLIC_BASE_URL=https://cms-auth.redactplus.io
   CMS_OAUTH_AUTH_ENDPOINT=auth
   CMS_GITHUB_REPOSITORY=Safe-Redact/Marketing-Site
   CMS_PUBLISH_BRANCH=main
   CMS_AUTH_SCOPE=repo
   ```
   then `cd /root/deploy/redactplus-landing && docker compose up -d` (a restart; no new image).
   `CMS_AUTH_SCOPE` must equal the broker's `OAUTH_GITHUB_SCOPE`, and `PUBLIC_SITE_ORIGIN` its
   `OAUTH_ALLOWED_ORIGINS`.

## Check it

- `https://redactplus.io/admin/config.yml` starts with "CMS authentication enabled" and names
  `base_url: https://cms-auth.redactplus.io`, `auth_scope: repo`, `branch: main`.
- `https://redactplus.io/admin` opens Decap with "Login with GitHub"; the popup goes to
  GitHub, then back, and the editor shows the Blog collection.
- Save a draft: a `cms/…` branch and a pull request appear on the repository. Close it
  without merging when the check is done.
- A GitHub account that is not in `OAUTH_ALLOWED_GITHUB_USER_IDS` gets "Authentication failed".
- `/var/log/nginx/cms-auth.access.log` shows `/callback` with no query string.

## Turning it off

Set `CMS_ENABLED=false` in the marketing `app.env` and restart it: `/admin` shows the notice
again. Then `docker compose down` in `/root/deploy/redactplus-cms-oauth`. If a secret may have
leaked: revoke the app's tokens on GitHub, regenerate the client secret and
`OAUTH_STATE_SECRET`, and restart the broker.

## Updating the broker

Export the new commit with `package-broker.sh`, replace `app/` on the server (keep the old
one as `app.previous`), `docker compose up -d`, and check `/health`. Rolling back is moving
`app.previous` back and the same command.

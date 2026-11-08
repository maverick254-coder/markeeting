# Running the forum locally (development and acceptance tests)

Everything runs on loopback, without Docker. Nothing here touches a server.

## 1. NodeBB on a private PostgreSQL

Requirements: Node ≥ 22.19 and PostgreSQL 16+ binaries (`initdb`, `pg_ctl`). Use a folder outside
the repository, for example `../.nodebb-trial`.

1. Create a private cluster on its own port. It accepts loopback connections only and needs no
   passwords, and leaves any other PostgreSQL untouched:
   ```bash
   initdb -D pg -U nodebb --auth-local=trust --auth-host=trust -E UTF8 --locale=C
   ```
   Then add `listen_addresses = '127.0.0.1'` and `port = 5544` to `pg/postgresql.conf`.
   ```bash
   pg_ctl -D pg -l pg.log start
   ```
   ```bash
   psql -h 127.0.0.1 -p 5544 -U nodebb -d postgres -c "CREATE DATABASE nodebb_forum OWNER nodebb;"
   ```
2. Get NodeBB v4.16.7 (`git clone --depth 1 --branch v4.16.7 https://github.com/NodeBB/NodeBB.git nodebb`),
   then in `nodebb/`:
   ```bash
   cp install/package.json package.json && npm install --omit=dev && npm install --save-exact nodebb-plugin-question-and-answer@2.0.5
   ```
3. Link the bridge from this repository (`ln -s`, or a junction on Windows):
   `nodebb/node_modules/nodebb-plugin-redactplus-bridge` → `services/forum-bridge`.
4. Set up NodeBB on the database, with a local administrator whose password you keep in a file:
   ```bash
   node app.js --setup='{"url":"http://localhost:4567","database":"postgres","postgres:host":"127.0.0.1","postgres:port":5544,"postgres:username":"nodebb","postgres:password":"","postgres:database":"nodebb_forum","admin:username":"forumadmin","admin:password":"<from your file>","admin:password:confirm":"<same>","admin:email":"forumadmin@forum.test"}'
   ```
5. Add the pinned plugins to `nodebb/config.json` (the same list as
   `deployment/forum/scripts/write-config.js`):
   ```json
   "plugins": { "active": ["nodebb-theme-harmony", "nodebb-plugin-composer-default", "nodebb-plugin-markdown", "nodebb-plugin-mentions", "nodebb-plugin-dbsearch", "nodebb-plugin-question-and-answer", "nodebb-plugin-redactplus-bridge"] }
   ```
6. Configure the forum, build, and start with a bridge key kept in a file:
   ```bash
   node ../../Marketing-Site/services/forum-bridge/scripts/setup-forum.js && ./nodebb build
   ```
   ```bash
   node -e "require('fs').writeFileSync('../bridge-key.txt', require('crypto').randomBytes(32).toString('base64url'))"
   ```
   ```bash
   REDACTPLUS_BRIDGE_KEY="$(cat ../bridge-key.txt)" node app.js
   ```

## 2. The portal with the forum on

```bash
cd apps/portal && node dev/forum-dev.mjs --key-file ../../../.nodebb-trial/bridge-key.txt
```

This starts the mock identity provider (port 3201, the production client's shape) and the portal
(http://localhost:3200) with `PORTAL_FORUM_ENABLED=true`. Sign in with any email.
`dev/.forum-idp-state.json` (git-ignored) controls who is a moderator and who is disabled, and the
mock provider reads it on every userinfo and refresh call:

```json
{ "roles": { "moderator@redactplus.test": ["forum-moderator"] }, "disabled": ["someone@redactplus.test"] }
```

Edit it while signed in to test role removal and account disablement.

## 3. Tests against the real NodeBB

All from `services/forum-bridge`.

1. Bridge unit tests:
   ```bash
   node --test test/unit.test.js
   ```
2. The 68 integration checks (about three minutes, because NodeBB's posting delays stay on):
   ```bash
   FORUM_BRIDGE_KEY_FILE=../../../.nodebb-trial/bridge-key.txt node test/integration.mjs
   ```
3. After restarting NodeBB, check that data and uploads persisted:
   ```bash
   FORUM_BRIDGE_KEY_FILE=../../../.nodebb-trial/bridge-key.txt node test/integration.mjs --verify-persisted
   ```
4. The moderator sweep. Start NodeBB with `REDACTPLUS_BRIDGE_MODERATOR_TTL_MINUTES=1` and
   `REDACTPLUS_BRIDGE_SWEEP_SECONDS=15` first, then:
   ```bash
   FORUM_BRIDGE_KEY_FILE=../../../.nodebb-trial/bridge-key.txt node test/integration.mjs --sweep-only
   ```

The portal's own checks run from `apps/portal`, as in CI:
```bash
npm run typecheck && npm run lint && npm test
```

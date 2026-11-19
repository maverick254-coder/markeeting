# Forum runbook

**Nothing here has been run on the production server.** Each step is written to be run after an
explicit go-ahead. The portal keeps the forum off until the last step.

## 1. Before installing (prerequisites)

1. **Approval** of the finished forum (the forum PR) and of these steps.
2. **Disk.** The forum needs about 1 GB for the image, plus room for backups and uploads growth.
   The shared host was at 94% at the last marketing release. Free at least 3 GB first, and check
   with `df -h /` and `docker system df`.
3. **Keycloak** (realm `saferedact`, Admin Panel team):
   - a realm or `redactplus-portal` client role `forum-moderator`, assigned only to staff who
     moderate;
   - the role must reach the portal's **userinfo** response: either the default realm/client role
     mappers with "Add to userinfo" on (the portal reads `realm_access.roles` and
     `resource_access.redactplus-portal.roles`), or a "User Realm Role" mapper named `roles`
     (multivalued, add to userinfo);
   - confirm that disabling a user, or removing a role, makes userinfo answer accordingly at once
     (Keycloak evaluates userinfo per request).
   - Customers' emails must be verified in Keycloak to post (`email_verified`); the website's
     trial registration already verifies them.
4. **Registry access** for `registry.safaridesk.io/safari/redactplus-forum`.

## 2. Build and publish (CI, never the server)

CI builds this Dockerfile on every pull request and push to `main` and runs the bridge
integration test against it (`images / build`). Publishing is part of the deployment workflow:
with `forum` in the production environment's `CD_COMPONENTS`, each push to `main` publishes
`registry.safaridesk.io/safari/redactplus-forum:<revision>` if it is not there yet, where the
revision is the last commit that changed the image's inputs (`deployment/cd/README.md`, "The forum
image"). That job's summary gives the `RELEASE_SHA` and `RELEASE_DIGEST` to use in §3. It never
touches the server.

Without CI (a build machine, never the server), use the same revision and push the result:

```bash
rev=$(node scripts/release/changed-components.mjs --head "$(git rev-parse HEAD)" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).forum.revision))')
docker build --platform linux/amd64 -f deployment/forum/Dockerfile --build-arg GIT_COMMIT="$rev" -t registry.safaridesk.io/safari/redactplus-forum:"$rev" .
```

Record the digest after pushing. The build checks the NodeBB release commit and builds NodeBB's
assets with a throwaway Redis that is not in the final image.

## 3. Install (files and secrets)

On the server, as root:

```bash
install -d -m 700 /root/deploy/redactplus-forum /root/deploy/redactplus-forum/secrets
```

Copy `compose.yaml`, `scripts/backup.sh` and `scripts/restore.sh` there. Then create:
- `.env` with `RELEASE_SHA` and `RELEASE_DIGEST`;
- `forum.env` from `forum.env.example` (mode 600);
- `db.env` from `db.env.example` (mode 600, the same password as `FORUM_DB_PASSWORD`);
- `secrets/admin-password` (mode 600, 20+ random characters, used only on the first start).

Generate every secret on the server: `openssl rand -base64 48 | tr -d '\n=' | tr '+/' '-_'`.

```bash
cd /root/deploy/redactplus-forum && docker compose up -d
```

The first start runs NodeBB's setup and creates the six portal categories. It then locks NodeBB
down: no registration, no guests, no federation, images only. Check:

```bash
docker compose ps
```

```bash
docker exec redactplus-forum node -e "fetch('http://127.0.0.1:4567/redactplus-bridge/v1/health',{headers:{'x-redactplus-bridge-key':process.env.REDACTPLUS_BRIDGE_KEY}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
```

Expect `{"ok":true,"data":{"status":"ready","categories":6,"acceptedAnswers":true,...}}`.

## 4. Staff access to NodeBB's own UI

Only for administrators, over SSH:

```bash
ssh -L 6097:127.0.0.1:6097 root@<server>
```

Then open `http://localhost:6097/login` and sign in with the first administrator. Immediately:
1. turn on two-factor authentication for that account (2factor plugin);
2. remove `secrets/admin-password` from the server.

Day-to-day moderation happens in the portal (`/forum/moderation`), by people with the Keycloak
`forum-moderator` role. Do not make customers or moderators NodeBB administrators.

## 5. Launch (turning the forum on in the portal)

1. Add the `PORTAL_FORUM_*` settings to the portal's `app.env` (see `app.env.example`), with the
   same bridge key.
2. Restart the portal on the forum network:
   ```bash
   cd /root/deploy/redactplus-portal && docker compose -f compose.yaml -f compose.forum.yaml up -d
   ```
3. Check, signed in as a test customer:
   - `/forum` lists questions;
   - you can ask a question with an image, answer, comment and vote;
   - `/forum/moderation` answers 404 for a customer and works for a moderator.
4. Roll back by removing `PORTAL_FORUM_ENABLED` and restarting the portal without
   `compose.forum.yaml`. The forum's data stays intact.

## 6. Monitoring and logs

- `docker compose ps`: both services `healthy`. The forum's health check calls the bridge with its
  key, so it covers NodeBB, the database and the bridge.
- `docker logs --since 1h redactplus-forum`: NodeBB and bridge logs (json-file, 5 × 10 MB). Lines
  starting `[redactplus-bridge]` are:
  - provisioning;
  - moderator rights removed;
  - index failures;
  - 500s (never message bodies).
- Portal logs show `[portal] forum request failed: <error class>` when the bridge is unreachable.
  Customers then see "The forum is not available right now".
- Watch disk: `du -sh /var/lib/docker/volumes/redactplus-forum-*` and `/root/backups/redactplus-forum`.

## 7. Backups (nightly)

```cron
30 2 * * * /root/deploy/redactplus-forum/backup.sh >> /var/log/redactplus-forum-backup.log 2>&1
```

The backup is a `pg_dump` of the forum database plus a tarball of the uploads volume, keeping
the newest 7 of each in `/root/backups/redactplus-forum/`. Copy them off the host with the other
backups.

## 8. Restore

From `/root/deploy/redactplus-forum/`:

```bash
./restore.sh /root/backups/redactplus-forum/forum_<UTC>.dump /root/backups/redactplus-forum/uploads_<UTC>.tar.gz
```

It asks for confirmation, stops NodeBB, replaces the database and the uploads, and starts NodeBB.
On start NodeBB upgrades the schema if needed, and the setup script re-applies the forum settings.
The restore method was checked locally: a dump restored into a fresh database gave identical row
counts.

## 9. Upgrades and rollback

- **Upgrade:** change the pinned versions in the Dockerfile and merge; CI runs the bridge
  integration test against the new image and publishes it (§2). Then update `.env` from that job's
  summary (keep the old one
  as `.env.previous`) and `docker compose up -d`. The schema upgrade runs on start.
- **Rollback:** restore `.env.previous` and `docker compose up -d`. If the new version upgraded the
  schema, restore the backup taken before the upgrade (§8).
- **Secrets:** rotating `REDACTPLUS_BRIDGE_KEY` needs the portal and the forum changed together.
  Rotating `FORUM_SECRET` signs administrators out of NodeBB's UI only.

## 10. Remaining launch prerequisites

- Keycloak `forum-moderator` role and its userinfo mapping (§1.3), confirmed by the Admin Panel team.
- Disk space on the host (§1.2).
- The image published and its digest recorded (§2): switch it on with `forum` in
  `CD_COMPONENTS`, then take `RELEASE_SHA` and `RELEASE_DIGEST` from the next run's summary.
- Product sign-off on forum rules:
  - posting delays;
  - verified email required to post;
  - suspended customers cannot read the forum (NodeBB's default for banned accounts).
- Moderator and administrator accounts named, and 2FA set for administrators (§4).

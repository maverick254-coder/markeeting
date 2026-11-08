# RedactPlus forum backend (NodeBB, private behind the portal)

**Status: files only. Nothing here has been built on the server, installed or deployed.**
The portal keeps the forum off until `PORTAL_FORUM_ENABLED=true` (see RUNBOOK.md, "Launch").

Customers use the forum at `home.redactplus.io/forum`, in the portal's own design and with their
RedactPlus sign-in. NodeBB stores and enforces everything behind it and is never published:

```
browser ──https──> portal (home.redactplus.io)  ──private network──>  NodeBB + RedactPlus bridge  ──>  PostgreSQL
           session cookie, CSRF token            bridge key + verified identity        own database, own volume
                                                 (server to server only)
staff admin ──SSH tunnel──> 127.0.0.1:6097 ──> NodeBB's own admin UI (local administrator accounts, 2FA)
```

| Piece | Where |
|---|---|
| Bridge plugin (private API, identity, moderator reconciliation) | `services/forum-bridge/` |
| Portal adapter, forum API, pages | `apps/portal/src/lib/community/`, `apps/portal/src/app/api/forum/`, `apps/portal/src/app/(portal)/forum/` |
| Image, compose, env templates, backup and restore | this folder |
| Operations | [RUNBOOK.md](RUNBOOK.md) |
| Running it all locally | [LOCAL.md](LOCAL.md) |

## Pinned versions

| Component | Version |
|---|---|
| Node | 22.23.4 (`node:22.23.4-bookworm-slim`, the portal's base image digest) |
| NodeBB | v4.16.7, commit `e10be67aceaec0581fd130c6ef7b5e2f1e7f64f2` (checked during the build) |
| `nodebb-plugin-question-and-answer` | 2.0.5 |
| `nodebb-plugin-dbsearch` | 7.0.7 |
| `nodebb-plugin-2factor` | 8.0.12 (administrators' sign-in to the private UI) |
| Theme, composer, Markdown, mentions | as bundled with NodeBB v4.16.7 |
| PostgreSQL | `postgres:16-alpine`, the digest the portal database already uses |

`config.json` pins the active plugins (`plugins.active`), so they cannot be changed from the
admin UI. Changing any version is a deliberate change in the Dockerfile and `scripts/write-config.js`.

## Security model

- **Not published.** NodeBB listens only on the internal Docker network `redactplus-forum`, which
  only the portal joins, and on host loopback `127.0.0.1:6097` for administrators over SSH.
  Customers cannot reach NodeBB, its API, its sign-in or its uploads.
- **One trusted caller.** The bridge answers only requests carrying `REDACTPLUS_BRIDGE_KEY`
  (32+ characters, compared in constant time). The key lives in the portal's and NodeBB's env
  files only, never in the browser.
- **Identity from the portal session.** The portal sends the customer's identity-provider subject
  (`sub`), display name, verified-email flag and current roles. The bridge maps `sub` to one NodeBB
  account (created on first use, no password, no email stored). It never accepts a NodeBB user id
  from the portal, never acts as an administrator, and never grants administrator rights.
- **NodeBB's own checks apply.** Every action calls NodeBB's internal API as that customer, so
  privileges, edit and delete windows, posting delays, flood limits, length and tag rules, upload
  privileges and file-type rules all apply. Bridge-specific checks add only what NodeBB lacks:
  - a reply's parent and an accepted answer must belong to the same question;
  - attachments must be the customer's own uploads;
  - uploads are decided by their bytes (PNG, JPEG, GIF or WebP, 5 MB), with EXIF stripped.
- **Moderators follow Keycloak.**
  - The portal asks Keycloak's userinfo endpoint for current roles on every write and on every
    moderator page (cached up to 60 s for plain reads).
  - The bridge grants or removes Global Moderators on every request.
  - A sweep removes moderator rights not re-confirmed within 15 minutes, and revokes that person's
    NodeBB web sessions.
- **Ended accounts end the session.** If Keycloak refuses userinfo (account disabled, session
  revoked), the portal ends its own session and sends the customer to sign in.
- **CSRF.** Forum writes need a same-origin request (Origin or Fetch Metadata) and the session's
  CSRF token in `x-csrf-token`. Only the actions listed in `apps/portal/src/lib/community/api.ts`
  exist.
- **Content.** Markdown renders without raw HTML. Links are `nofollow ugc` and open safely. Images
  render only from the portal's signed-in image route, so posts cannot load outside images.
  Uploaded images are served with `nosniff` and a sandbox CSP.
- **Duplicates and spam.**
  - Posts carry an idempotency key, so a double click or a retry cannot post twice.
  - The portal limits writes to 30 a minute per customer, and uploads to 20 per 10 minutes.
  - NodeBB's posting delays apply: 10 s for new accounts, 30 s between posts until 3 reputation,
    then 10 s.
- **No federation, no guests.** ActivityPub is off. Guests, crawlers and the fediverse have no
  privileges. NodeBB registration is disabled, and local password sign-in is for administrators
  only.

## Sizing (estimates; see docs/portal/forum-nodebb-trial.md §7 for the measurements)

| Resource | Limit / estimate |
|---|---|
| NodeBB memory | 640 MB container limit (heap 448 MB); about 260 MB at idle |
| Database memory | 256 MB limit; tens of MB of data for thousands of posts |
| Image on disk | about 600–700 MB new layers; the Node base layer is shared with the portal |
| Uploads | about 0.3 GB per 1,000 images (resized above 2,000 px; 5 MB cap) |
| Backups | 7 nightly database dumps plus 7 upload archives |

The host was at 94% disk at the last marketing release: free space before installing
(RUNBOOK.md, "Before installing").

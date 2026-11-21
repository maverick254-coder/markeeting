# RedactPlus Home, the customer portal (`home.redactplus.io`)

The signed-in half of the RedactPlus website: downloads, getting-started documentation, news,
release notes and support, plus a community forum that stays hidden until a forum service
exists. It is a separate Next.js application in the marketing
repository, with its own `package.json`, lockfile, image and deployment. The marketing site does
not depend on it.

It is a continuation of redactplus.io, not a second marketing site. It uses the same light
palette, type scale, compact header, buttons and logo; it has no hero, no promotional cards and
no sign-in or registration controls of its own.

- **Every page requires a session.** Without one, the visitor goes through the existing entry
  point (`/auth/start`, then RedactPlus sign-in) and back to the page they asked for.
- **Account** is an initials avatar in the header whose only action is Sign out.
- **Home** (`/`) is the downloads and resources hub: the latest verified installer, then
  compact groups for getting started, news, documentation and the community.
- **Forum** (`/forum`, `/forum/questions/[slug]`, `/forum/ask`, `/forum/notifications`,
  `/forum/moderation`): a Q&A index with search, answered/unanswered filters, sorting,
  categories, tags and pagination. Question pages have:
  - answers, voting, an accepted answer and nested comments;
  - editing, deleting and reporting;
  - a composer with Markdown preview and image uploads.

  Moderators get a report queue. The forum is backed by NodeBB, private behind the portal,
  through the RedactPlus bridge (`services/forum-bridge`, `deployment/forum`). The portal calls
  it server side with `src/lib/community/bridge.ts` and `/api/forum/*`. It is **off unless
  `PORTAL_FORUM_ENABLED=true`**: until then every forum URL is a 404 and there is no navigation
  entry.
- **News** (`/news`) lists staff posts from the forum's Announcements category, read through the
  bridge (`GET /announcements`): pinned first, then newest, filtered by type (News or
  Announcement, a tag). Each item opens its forum thread, where customers reply. Only staff
  (Keycloak `forum-moderator`) can post there ("Post to News"); the forum refuses everyone else,
  and only topics the bridge marked as staff posts at creation are listed. Without the forum,
  News says nothing has been published. Release notes stay file-based (`content/releases.json`).
- **The download UI** shows product, version, platform, size, the download button and release
  notes. The SHA-256 is not displayed: the manifest requires it, and `releases:verify` checks
  it against the published file before a release is listed.
- **Sign-in from the marketing dialog:** `POST /api/auth/credentials/{register|signin|password-reset}`
  (src/lib/credential-auth) accepts only the marketing origin over CORS. It answers
  `503 credential_auth_unavailable` until the backend credential API exists
  (docs/portal/backend-integration-boundary.md §6).

Phase status:
- **Working:** sign-in, sessions, downloads, release notes and search.
- **Forum:** complete, against NodeBB through the bridge. It is off in production until it is
  enabled (deployment/forum/RUNBOOK.md).
- **Not available yet:** Documentation, Tutorials, News, Announcements and Support tickets.
  Each is marked that way on its page.

## Structure

```text
apps/portal/
  content/releases.json          release manifest (validated; RedactPlus Desktop 0.3.8)
  content/release-sources/<tag>/ the GitHub release’s own release.json and SHA256SUMS.txt (provenance)
  dev/mock-idp/server.mjs        DEVELOPMENT identity provider (loopback only, refuses production)
  scripts/validate-releases.ts   manifest check, run before every build
  scripts/verify-release.ts      downloads an installer and checks its size and SHA-256
  src/middleware.ts              per-request nonce CSP
  src/app/(portal)/              signed-in pages: / download forum docs news release-notes support search
  src/app/{auth/error,signed-out,not-found}   the only pages shown without a session (minimal shell)
  src/components/                header (nav, search, AccountMenu), DownloadSection, CommunityBoard, ...
  src/lib/community/             forum shape, planned categories, development-only fixtures
  src/lib/search.ts              portal search (sections and release notes)
  src/lib/initials.ts            avatar initials from the verified session identity
  src/app/auth/{start,callback,logout}/route.ts   OIDC journey
  src/app/api/{downloads/[version],session,health}/route.ts
  src/lib/config.ts              environment parsing and production guards
  src/lib/oidc.ts                Authorization Code + PKCE client (openid-client 6.8.8)
  src/lib/crypto.ts              AES-256-GCM sealing (HKDF keys per purpose)
  src/lib/return-to.ts           post-sign-in redirect allowlist
  src/lib/session/               server-side sessions (Postgres in production, memory locally)
  src/lib/releases/              manifest schema and selection
  src/lib/customer-api/          PROPOSED backend contract (not yet available)
  tests/*.test.ts                unit tests
  tests/routes/                  route tests against the built app and the development provider
```

## Commands

```bash
npm --prefix apps/portal ci
npm --prefix apps/portal run typecheck
npm --prefix apps/portal run lint
npm --prefix apps/portal run build        # validates content/releases.json first
npm --prefix apps/portal run test         # unit tests, then route tests (needs a build)
```

## Local development

1. Copy `.env.example` to `.env.local`. Generate `PORTAL_SESSION_SECRET` and pick any 16+
   character `PORTAL_OIDC_CLIENT_SECRET`.
2. In one terminal, start the development identity provider with the same secret:
   `MOCK_IDP_CLIENT_SECRET=<same value> npm --prefix apps/portal run dev:idp`
3. In another terminal: `npm --prefix apps/portal run dev`, then open http://localhost:3200.

The development provider says on every page that it is not RedactPlus sign-in. It asks for no
password and accepts any test identity. The portal has **no mock mode**: it talks to this
provider exactly as it would talk to Keycloak.

Development settings cannot reach production:
- `PORTAL_ENVIRONMENT` defaults to `production`.
- Non-production values are refused unless the portal is served from a loopback origin.
- Production refuses an `http` issuer, an `http` origin and the in-memory session store.
- The provider refuses `NODE_ENV=production` and binds only to 127.0.0.1.

## Environment variables (names only)

| Name | Required | Purpose |
|---|---|---|
| `PORTAL_PUBLIC_ORIGIN` | yes | `https://home.redactplus.io`. Builds the redirect and post-logout URIs. |
| `PORTAL_SESSION_SECRET` | yes | 32+ random bytes. Keys for the sign-in transaction cookie and for tokens at rest. |
| `PORTAL_SESSION_STORE` | no | `postgres` (default). `memory` is local only. |
| `PORTAL_DATABASE_URL`, `PORTAL_DATABASE_SSL` | with postgres | Portal-owned database. Schema: `src/lib/session/schema.sql`. |
| `PORTAL_OIDC_ISSUER`, `PORTAL_OIDC_CLIENT_ID`, `PORTAL_OIDC_CLIENT_SECRET` | all or none | Keycloak realm and the portal's confidential client. Unset: sign-in reports itself unavailable. |
| `PORTAL_OIDC_SCOPES` | no | Default `openid profile email`. |
| `PORTAL_OIDC_REGISTRATION_PROMPT` | no | Default `create` (OIDC `prompt=create`). Set to empty if the realm rejects it. |
| `PORTAL_DOWNLOAD_ALLOWED_HOSTS` | no | Exact host names that installer URLs may use. Empty: nothing is downloadable. Use `github.com` for the GitHub Releases installer. |
| `PORTAL_RELEASES_MANIFEST_PATH` | no | Overrides `content/releases.json` (tests use a fixture). |
| `PORTAL_CUSTOMER_API_URL` | no | Proposed backend customer API. **Not yet available.** |
| `PORTAL_ACCOUNT_MANAGEMENT_URL` | no | Reserved. Not shown while the account menu holds Sign out only. |
| `PORTAL_SUPPORT_EMAIL` | no | Shown in the footer and on Documentation. |
| `PORTAL_MARKETING_ORIGIN` | no | Default `https://redactplus.io`. |
| `TRUST_PROXY_HOPS` | no | `1` behind host nginx. Used for per-address rate limits. |
| `PORTAL_ENVIRONMENT` | no | Never set in production. `development` and `test` work on loopback only. |
| `PORTAL_DEV_COMMUNITY_FIXTURES` | no | `true` shows sample forum discussions, read-only, under a "Development sample data" banner. Refused in production. |
| `PORTAL_FORUM_ENABLED` | no | `true` turns the forum on. Needs both bridge settings. Unset: no forum anywhere. |
| `PORTAL_FORUM_BRIDGE_URL` | with the forum | NodeBB's private address: https, loopback, or a private service name such as `http://redactplus-forum:4567`. |
| `PORTAL_FORUM_BRIDGE_KEY` | with the forum | The bridge key (32+ characters), the same as NodeBB's `REDACTPLUS_BRIDGE_KEY`. Server side only. |
| `PORTAL_FORUM_MODERATOR_ROLE` | no | The identity provider role for forum moderators. Default `forum-moderator`. |

## Authentication

- **Start** (`/auth/start?intent=register|signin&return=/download`): creates a PKCE S256
  verifier, a state and a nonce, and seals them with the return path into
  `__Host-rp_auth`. That cookie is HttpOnly, Secure, SameSite=Lax and expires after 10
  minutes. The browser is then redirected to the provider. `intent=register` adds
  `prompt=create`.
- **Callback**: the transaction cookie is single use. The code is exchanged on the server,
  and state, nonce, issuer and PKCE are all checked. Any earlier session is destroyed and a
  new random session ID is issued in `__Host-rp_session`: HttpOnly, Secure, SameSite=Lax,
  host-only, never shared with `redactplus.io`. Only the SHA-256 of the ID is stored.
- **Sessions**: they end after 8 hours idle or 24 hours in total. Provider tokens are stored
  AES-256-GCM-encrypted and never reach the browser.
- **Logout**: a POST only. It requires the portal's Origin (or Fetch Metadata same-origin)
  plus the session's CSRF token. It destroys the session, then redirects to the provider's
  end-session endpoint with `id_token_hint`.
- **Redirects**: `return` accepts only same-origin paths under `/`, `/download`,
  `/forum`, `/docs`, `/news`, `/release-notes`, `/support` and `/search`. Anything else falls back to `/`.
- **Errors**: `/auth/error?reason=…` maps a fixed set of reasons to fixed messages. The query
  value is never rendered.

Keycloak client the backend team needs to create (see
`docs/portal/backend-integration-boundary.md`):
- confidential client, standard flow only, PKCE S256 required;
- redirect URI `https://home.redactplus.io/auth/callback`;
- post-logout redirect URI `https://home.redactplus.io/signed-out`;
- web origin `https://home.redactplus.io`.

## Release manifest (`content/releases.json`)

```json
{
  "schemaVersion": 1,
  "product": "RedactPlus Desktop",
  "releases": [
    {
      "version": "1.4.0",
      "channel": "stable",
      "releasedOn": "YYYY-MM-DD",
      "supported": true,
      "installer": {
        "platform": "windows-x64",
        "fileName": "RedactPlus-Desktop-1.4.0-x64.exe",
        "url": "https://<allowed host>/<path>",
        "sizeBytes": 0,
        "sha256": "<64 lower-case hex>",
        "verification": { "method": "sha256-of-downloaded-file", "verifiedOn": "YYYY-MM-DD", "verifiedBy": "<role>" }
      },
      "systemRequirements": ["…"],
      "notes": [{ "kind": "added|improved|fixed|security|known-issue", "text": "…" }],
      "notesUrl": "https://… (optional)"
    }
  ]
}
```

To publish a release:
1. Upload the installer to an allowlisted host.
2. Add the entry without its `verification` block.
3. Run `npm --prefix apps/portal run releases:verify -- <version>`. It downloads the file and
   checks the size and SHA-256.
4. Only when that passes, add the `verification` block and merge.

The file name or a whole URL path segment (such as the GitHub tag `v0.3.8`) must contain the
version, and the URL must end with the file name.

The portal links a release only when:
- it is `supported`;
- its host is in `PORTAL_DOWNLOAD_ALLOWED_HOSTS`;
- the whole manifest validates.

Downloads go through `/api/downloads/<version>`. That route:
1. requires a session;
2. records the download in the customer's history;
3. redirects to the verified asset URL, with `Referrer-Policy: no-referrer`.

For GitHub Releases, GitHub answers that URL with a short-lived signed redirect to
`release-assets.githubusercontent.com`, served as `Content-Disposition: attachment`. The browser
downloads the file and stays on the portal page. It never shows the release overview page.

### Publishing a release from GitHub Releases

Installers are published at `Safe-Redact/redactplus-downloads`. Each release carries the
installer, plus `release.json` and `SHA256SUMS.txt`. Never type a version, size or checksum by
hand.

1. **Import.** Run `npm --prefix apps/portal run releases:import -- v<version>`.
   - It downloads the release's `release.json` and `SHA256SUMS.txt`.
   - It refuses to continue unless they agree with each other and with the tag.
   - It saves both unchanged under `content/release-sources/v<version>/`.
   - It prints a candidate manifest entry with **no** verification block. It does not edit the
     manifest or download the installer.
2. **Review and add.** Review the entry before adding it to `content/releases.json`:
   - the note kinds (`release.json` notes have no category);
   - the system requirements;
   - whether older entries stay `supported`.

   The note text must stay exactly as published.
3. **Verify.** Run `npm --prefix apps/portal run releases:verify -- <version>`. It downloads the
   real installer through GitHub's redirect and checks the exact size and SHA-256. Do not continue
   if either differs.
4. **Record.** Only after step 3 passes, add
   `"verification": { "method": "sha256-of-downloaded-file", "verifiedOn": "<today>", "verifiedBy": "<role>" }`.

Until step 4, the manifest fails validation and `npm run build` refuses to ship it.

`tests/releases-and-customer-api.test.ts` cross-checks every shipped entry against its saved
`release.json` and `SHA256SUMS.txt`: URL, size, SHA-256, date and note text. An edited value fails
the tests.

For other hosts, the same rules apply: upload, add the entry without verification, run
`releases:verify`, then record the verification.

## Pending backend dependencies

- The `redactplus-portal` Keycloak client and the confirmed issuer URL.
- Self-registration on the realm, with required email verification.
- `GET /v1/api/customer/me` for licence status and `POST /v1/api/customer/trial` for trial
  provisioning. Both are proposed, not verified.
- A 7-day term and a trial plan in the Control Center.

Until the customer API exists:
- the portal never claims a trial;
- no licence or trial status is shown anywhere in the portal;
- downloads are gated on sign-in only.

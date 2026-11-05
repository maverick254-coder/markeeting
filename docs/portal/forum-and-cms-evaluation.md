# Forum engine and CMS evaluation (5 November 2026)

**Goal:** choose a free, open-source way to back the portal's forum (Stack Overflow-style Q&A)
and its editorial content (news, announcements, release posts, tutorials, documentation),
without building a forum backend and without a redundant CMS.

**Status:** nothing has been installed or deployed. The portal's forum and news UIs run on
interfaces (`ForumService` in `apps/portal/src/lib/community/types.ts`, and
`apps/portal/src/lib/editorial/news.ts`). In production those interfaces report an honest empty
state.

## 1. What already exists

| Piece | What it does | Reusable for |
|---|---|---|
| **Decap CMS** (`/admin`, `config/decap-cms.yml`) | Git-based CMS. GitHub backend with `publish_mode: editorial_workflow` (draft → in review → ready, each a branch and pull request), a media folder in the repository, Markdown body, categories, tags, featured image. Staff sign in with GitHub through `services/cms-oauth-broker`, limited to an allowlist of staff IDs plus repository push access. Disabled on the RedactPlus deployment (`CMS_ENABLED=false`). | **News, announcements, release posts, tutorials and documentation.** The portal now reads the same Markdown-plus-front-matter shape from `apps/portal/content/news`. |
| **Comments engine** (`src/lib/comments`) | Postgres-backed comments on blog articles: `pending` / `approved` / `rejected` / `removed` statuses, threads up to depth 2, abuse reports with reasons, rate limits and an HMAC abuse secret, and staff moderation through `/moderation`, authorized by GitHub identity. | **Comments on portal news articles**, after switching author identity from a typed name to the portal session (Keycloak `sub`). Not a forum: it has no questions, votes, tags, search or accepted answers. |

## 2. Forum engines

| | **NodeBB** | **Flarum** | **Discourse** |
|---|---|---|---|
| Licence | GPL-3.0 | MIT | GPL-2.0 |
| Stack | Node.js, plus Redis, MongoDB **or PostgreSQL** | PHP 8 plus MySQL/MariaDB | Ruby on Rails, Postgres, Redis, Sidekiq, via the official Docker launcher |
| Self-hosting footprint | Small. One Node process; can share our Postgres server with its own database | Small. PHP-FPM plus database | Large. Minimum 1 GB RAM plus swap and 10 GB disk; 2 cores and 2 GB+ recommended ([hardware guide][zima]) |
| Rich text and images | Markdown composer, image uploads, attachments via plugin | Markdown/BBCode, uploads via the FoF Upload extension | Markdown composer, uploads, the best attachments |
| Moderation | Queues, flags, bans, roles | Flags, approval, suspend (extensions) | The most complete: flags, review queue, trust levels, spam handling |
| Q&A: accepted answer | Official [`nodebb-plugin-question-and-answer`][nbqa] (BSD-2): questions, a solved state, the accepted answer moved to the top. Last push February 2024, so **compatibility with current NodeBB must be checked** | [FoF Best Answer][fofba] extension. **Flarum 2.0 is still in beta** ([2.0.0-beta.6][fl2]); 2.0 support for extensions is unconfirmed | Accepted answers through the "solved" plugin. I could not confirm from a primary source whether it is now bundled with core; check this |
| Q&A: voting | Native up/down votes, with sorting by votes | FoF Gamification (up/down votes, ranks) | [Post Voting][dpv] is bundled with core: question topics with votes and answers sorted by votes |
| API for our own UI | **Read API, plus Write API v3 with bearer tokens.** A master token can act for a user through `_uid` ([write API][nbwrite]), which fits a server-side portal adapter | JSON:API with API keys that can act for a user | Full REST API; an admin key with `Api-Username` acts for a user. Designed around its own Ember UI, so headless use is unusual |
| SSO with Keycloak (OIDC) | OAuth2/OIDC SSO plugins (not verified for current versions here) | Community OAuth/OIDC extensions | OpenID Connect plugin (official) |
| Security maintenance | Node dependency updates, plugin updates | PHP, Composer and extension updates during the 1.x to 2.0 transition | Own update channel via the launcher; frequent releases |
| Backups | Database dump plus uploads folder | Database dump plus storage folder | Built-in backups (database plus uploads) |

## 3. Recommendation: NodeBB, headless behind the portal

**Why NodeBB:**
- **It fits how the portal is built.** The forum UI now lives in `home.redactplus.io` under the
  marketing design system: index, question page and composer. NodeBB's read API plus Write API
  v3 (master token acting for `_uid`) lets a server-side `ForumService` adapter list, read and
  post as the signed-in customer. The browser never holds a forum token.
- **It fits our hosting.** One Node container, a database on our existing Postgres server, and an
  uploads volume, beside the portal and marketing containers. Discourse's footprint is a poor
  match for a host already at 94% disk.
- **Q&A is covered by plugins**, not custom code: native voting plus the official Q&A plugin.
- **Licensing:** GPL-3.0 is compatible with running it as a service. We would modify only
  configuration and plugins.

**Before committing**, do a one-day spike on the current NodeBB release:
1. Confirm `nodebb-plugin-question-and-answer` works, or choose a maintained fork.
2. Confirm an OIDC plugin works against the RedactPlus Keycloak realm.
3. Confirm Write API v3 covers topics, posts, votes, solving, flags and uploads, acting as a user.

**Fallbacks:**
- **If the spike fails, use Discourse as its own site** (`community.redactplus.io`, themed,
  Keycloak via its OIDC plugin). It has the most mature Q&A (Post Voting plus solved) and
  moderation, but it is a separate-looking app and a larger server.
- **Flarum** becomes attractive once 2.0 and its FoF Q&A extensions are stable.

**What changes in the portal when the engine arrives:**
- **New adapter:** implement `ForumService` for NodeBB. Map topics to `QuestionSummary`, posts
  to answers and comments, solved state to `hasAcceptedAnswer`, and views and votes directly.
- **Turn on the controls:** enable voting, posting, editing, reporting and accepting through the
  write API, and remove the disabled "not live" states.
- **Identity:** NodeBB users are created on first sign-in through the same Keycloak realm. The
  portal maps its session `sub` to the NodeBB `uid`.

## 4. Editorial publishing: reuse Decap, do not add Payload

[Payload 3][payload] is MIT-licensed and runs inside a Next.js app, but it needs its own
database (MongoDB or Postgres) at build and run time, an admin UI, and media storage. Decap
already covers what the portal needs:
- drafts and review through the editorial workflow;
- Markdown rich text, images, categories, tags and featured flags;
- version history in Git;
- staff-only access.

Adding Payload would be a second CMS with a second admin login and a stateful service to run
and back up, for features we don't need yet (relational content, an in-app media library).

**Revisit Payload only if editors need:**
- scheduled publication without a deploy;
- non-GitHub staff accounts;
- structured relations across many content types.

### The Decap collection for portal news (to add when the CMS is enabled)

```yaml
- name: portal-news
  label: Portal news and announcements
  folder: apps/portal/content/news
  create: true
  slug: "{{slug}}"
  media_folder: /apps/portal/public/images/news
  public_folder: /images/news
  fields:
    - { label: Title, name: title, widget: string }
    - { label: Date, name: date, widget: datetime, format: "YYYY-MM-DD", date_format: "YYYY-MM-DD", time_format: false }
    - { label: Type, name: type, widget: select, options: [news, announcement, release] }
    - { label: Category, name: category, widget: string }
    - { label: Tags, name: tags, widget: list, default: [] }
    - { label: Excerpt, name: excerpt, widget: text }
    - { label: Status, name: status, widget: select, options: [draft, published], default: draft }
    - { label: Featured, name: featured, widget: boolean, default: false }
    - { label: Author, name: author, widget: string }
    - { label: Image, name: image, widget: object, required: false, fields: [{ label: Source, name: src, widget: image }, { label: Alt text, name: alt, widget: string }] }
    - { label: Body, name: body, widget: markdown }
```

The portal validates every file (`newsFrontMatterSchema`) and renders only `status: published`
entries. Tutorials and documentation can follow as further collections with the same pattern.

## 5. Identity requirements shared by all candidates

- One identity: the RedactPlus Keycloak realm. No separate forum sign-up or password.
- The forum identifies users by Keycloak `sub`; the display name comes from the token.
- Staff and moderator roles come from a Keycloak group or role, not from forum-local
  promotion, so revoking access in one place removes it everywhere.
- Server-side tokens only. The portal calls the forum API; the browser talks only to the portal.

[nbqa]: https://github.com/NodeBB/nodebb-plugin-question-and-answer
[nbwrite]: https://github.com/NodeBB/NodeBB/blob/aa8faf58a0462515bb2ecc8cd6cf026eca680065/public/openapi/write.yaml
[fofba]: https://github.com/FriendsOfFlarum/best-answer
[fl2]: https://discuss.flarum.org/t/version-2x
[dpv]: https://meta.discourse.org/t/discourse-post-voting/227808
[zima]: https://shop.zimaspace.com/de/pages/discourse-hardware-requirements
[payload]: https://dev.co/cms/open-source/payload

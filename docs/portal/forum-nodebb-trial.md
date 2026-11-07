# NodeBB feasibility trial for the RedactPlus Home forum (7 November 2026)

A local-only trial of the spike recommended in
[forum-and-cms-evaluation.md](forum-and-cms-evaluation.md) §3. Nothing here is deployed. No forum
runs on any server, live sign-in is untouched, and production forum navigation stays off.
The portal's existing forum pages and components remain the design. NodeBB is tested only as
the engine behind them.

**Verdict: NodeBB is suitable as a headless engine behind the portal, with a small amount of
our own glue.** It covers the hard parts (storage, Q&A state, votes, search, notifications,
flags, moderation, upload safety, anti-spam). The gaps are narrow and known: a bridge plugin of
about five REST routes and a production adapter. No forum engine we looked at fits our design
off the shelf, so some glue was always going to be needed. Discourse and Flarum are not a
better fit (see §8).

## 1. What was run

| Piece | Version / setting |
|---|---|
| NodeBB | **v4.16.7** (latest v4 tag; install from the GitHub release, because the npm `nodebb` package is an old placeholder). Needs **Node ≥ 22.19**; tested on Node 22.23.4 |
| Q&A | `nodebb-plugin-question-and-answer` **2.0.5** (compatible with `^4.14.3`, updated 25 Oct 2026). The evaluation's worry that it was last updated in 2024 is out of date |
| SSO | `nodebb-plugin-sso-oauth2-multiple` **2.1.3** (official, `^4.14.0`, updated 15 Oct 2026): OIDC discovery, PKCE, role → group mapping, `sub` → uid lookup |
| Search | `nodebb-plugin-dbsearch` 7.0.7 (supports Redis, MongoDB and PostgreSQL) |
| Database | Redis-compatible (Memurai) on loopback, database 7. Production would use PostgreSQL (§7) |
| Identity | The portal's mock OpenID provider (`apps/portal/dev/mock-idp`), run as a second confidential client on port 3202 to stand in for Keycloak |
| Portal | `apps/portal` dev server with `PORTAL_DEV_FORUM_NODEBB_URL` and `PORTAL_DEV_FORUM_NODEBB_TOKEN` set (refused outside non-production, and only for loopback hosts) |

Scripts and the bridge plugin used are in [`nodebb-trial/`](nodebb-trial/). The NodeBB
install, database, master token and client secret were kept outside the repository and never
committed.

### Trial-only settings (not recommendations)

To script many posts quickly, the trial set `initialPostDelay`, `postDelay`, `newbiePostDelay`
and `newbieReputationThreshold` to 0 and turned the post queue off. With NodeBB's defaults, a
new user's first post is refused for 10 seconds and then **queued for approval (HTTP 202)**.
Production should keep those defaults and show them in the portal (§5).

## 2. Flows proven through the API (27 / 27)

`nodebb-trial/flows.mjs` drives NodeBB the way a server-side adapter would: one master token,
acting as each user through `_uid`. Every check passed:

- **Structure:** the six planned portal categories; customers, and a staff user made a Global Moderator through a group.
- **Questions:** created with Markdown and tags; the Q&A plugin marks them unsolved.
- **Answers and comments:** two answers (customer and staff); a comment on an answer, and a reply to that comment.
- **Votes:** up and down votes on questions and answers; voting on your own post is refused.
- **Accepted answer:** only the question's author (or a moderator) can accept; a post from another question is refused; `solvedPid` names the accepted answer.
- **Discovery:** popular tags, full-text search (dbsearch), and the unsolved list.
- **Notifications:** the asker is notified of answers and votes. Delivery is batched, a few seconds behind.
- **Moderation:** a customer reports a post; moderators see the queue and customers do not; a moderator removes a post.
- **Isolation:** a customer cannot open admin pages (403), create API tokens (403), edit or delete other people's posts (403), or make themselves an administrator (401).

The portal's forum index and question page then rendered this NodeBB data in the portal's own
design, through `apps/portal/src/lib/community/nodebb.ts`. Only a trial banner was added.

## 3. Keycloak sign-in without a separate password (proven against the mock provider)

The SSO plugin was configured as strategy `redactplus` (OIDC discovery, PKCE, confidential
client, `roles` claim mapped `forum-moderator` → Global Moderators).

| Check | Result |
|---|---|
| `/auth/redactplus` sends the user to the provider with PKCE S256 and `state` | ✓ |
| First sign-in creates the NodeBB user, linked by the provider's `sub` | ✓ uid 15, `redactplusId` = the `sub` |
| No NodeBB password exists for that user | ✓ no `password` field stored |
| Email marked confirmed when the provider says `email_verified` | ✓ |
| Staff role → Global Moderators | ✓ |
| A customer gets no moderator rights | ✓ uid 16, not in Global Moderators |
| `GET /api/v3/plugins/oauth2-multiple/provider/redactplus/user/:sub` returns the uid | ✓ (this is how the portal maps its session `sub` to a NodeBB uid) |
| Signing in again reuses the same account | ✓ same uid, matched by `sub` |
| Removing the role takes moderator rights away | ✓, **but only if the token still carries a `roles` array (even `[]`) and only at the user's next sign-in**. If the claim is missing, the plugin changes nothing and the demoted user stays a moderator |

Points to settle for Keycloak:
- **Always send `roles`.** Add a client-scope mapper that puts the forum roles into the
  userinfo response as a multivalued `roles` claim. Keycloak's default roles make sure the claim
  is never empty, so a removed role really is removed.
- **Revocation is not immediate.** For the portal-fronted design, the portal should sync the
  moderator group itself on each request or session refresh (bridge route, §5).
- **Do not trust email to link accounts unless Keycloak verifies email.** The plugin can attach
  a sign-in to an existing account with the same email (`trustEmailVerified`). That is safe only
  if `email_verified` in Keycloak is real.
- **Turn off NodeBB's GDPR consent page** (`gdpr_enabled`) or answer it in the portal's own
  terms. The trial stopped there after the first sign-in.
- New SSO strategies and plugins load only when NodeBB starts. Plan configuration changes as
  restarts.

**Important for the headless design:** the SSO plugin creates a NodeBB user only when someone
goes through NodeBB's own `/auth/redactplus` page. Customers using the portal never visit
NodeBB, so the **portal has to provision and link NodeBB users itself** (bridge route, §5).
NodeBB's own SSO is still worth keeping for **staff**, who can moderate in NodeBB's own UI on a
staff-only hostname without a separate password.

## 4. How the portal talks to NodeBB

- **Server side only.** The portal's `ForumService` calls NodeBB's Read API (`/api/...`) and Write
  API v3 (`/api/v3/...`) with a **master token** and `_uid` set to the signed-in customer. The
  browser talks only to the portal and never holds a forum token. NodeBB itself does not need to
  be reachable from the internet for customers.
- **Mapping convention** (the adapter enforces it when posting; NodeBB stores flat replies):
  topic with `isQuestion` → question; reply without `toPid` → answer; reply to the question post
  → question comment; reply to an answer or comment → nested comment; `solvedPid` → accepted
  answer; post `votes` → score.
- **Gaps in stock NodeBB that the bridge plugin fills** (`nodebb-trial/nodebb-plugin-redactplus-bridge`):
  - *Accept / unaccept an answer:* the Q&A plugin offers this only over socket.io. The bridge
    exposes it as REST and calls the plugin's own handler, so its permission check is reused.
    It also checks that the answer belongs to the question, which the plugin does not.
  - *Uploads:* NodeBB's `/api/post/upload` enforces CSRF even for API tokens (403). The bridge
    route runs the same controller, so upload privileges, the allowed-type list, EXIF stripping,
    resizing and rate limits all still apply. Proven: a customer's image was stored; a `.php`
    file was refused. NodeBB reports that refusal as HTTP 500, not a 4xx.

## 5. Compared with the portal's forum design

| Design feature | NodeBB | Work needed |
|---|---|---|
| Categories | ✓ | Map by configured cid, not by name as the trial does |
| Questions, Markdown, tags | ✓ | — |
| Answers vs comments, nested replies | ✓ via `toPid` | Adapter enforces the convention and `MAX_COMMENT_DEPTH` when posting |
| Accepted answer | ✓ Q&A plugin | Bridge route (done in trial) |
| Voting, self-vote refused | ✓ native | — |
| Answered / unanswered filter | ✓ `isSolved`, `/api/unsolved` | — |
| Search | ✓ dbsearch | — |
| Pinned questions | ✓ | — |
| Answer count | ✗ `postcount` counts comments too | Bridge: keep a top-level answer count on the topic |
| View count | ✗ API reads are not counted | Bridge: count a view when the portal shows a question |
| Attachments list (`ForumAttachment`) | Uploads ✓; no per-post attachment list | Bridge or adapter: record uploads per post (name, size, kind) |
| Notifications | ✓ generated | Portal UI to show them (not designed yet) |
| Reporting and moderation | ✓ flags, queue, delete, ban | Report button in portal; staff moderate in NodeBB's UI |
| Anti-spam (first-post delay, post queue) | ✓ | Portal must show "please wait" (400) and "awaiting review" (202) states |
| Edit / delete own posts | ✓ Write API | Portal controls |
| Visual design | Not used | None: portal pages stay the authority |

Adapter shortcuts that are fine for the trial but must change for production:
- It reads only `/api/recent` (the first page) and filters in memory. Production must page and
  push filters to NodeBB (category, tag, solved/unsolved endpoints).
- It fetches raw Markdown one post at a time (`/api/v3/posts/:pid/raw`). A bridge route should
  return a whole thread's raw Markdown in one call.
- It is read-only. Writes (ask, answer, comment, vote, accept, report, upload) were proven by
  `flows.mjs` through the same API, but the portal's controls are not wired yet.

## 6. Custom implementation needed (estimates)

1. **Bridge plugin** (about 1–2 days, building on the trial): accept and unaccept, uploads, user
   provisioning and linking by `sub` (setting the same `redactplusId` link the SSO plugin uses),
   moderator group sync from portal roles, view counting, answer count, thread raw Markdown in
   one call. Contract tests run against a NodeBB container.
2. **Production `ForumService` adapter** (about 3–5 days): reads with paging, writes, error
   mapping (rate limits, the 202 queue, permission refusals), and a short cache for categories
   and staff membership.
3. **Portal UI** (separate estimate): turn on the disabled controls, add a notifications view, and
   add reporting.
4. **Operations:** a NodeBB image built in CI (`nodebb build` is the memory peak, so it should not
   run on the server), a Keycloak client and roles mapper, a PostgreSQL database, an uploads
   volume and backups.

## 7. Production sizing (estimates from the trial)

| Resource | Measured locally | Production estimate |
|---|---|---|
| Memory | NodeBB process ~260 MB working set at idle (single process, small data); Redis 2.5 MB | Container limit 512 MB–1 GB for one process. Build the assets in CI, not on the host |
| Disk (software) | Install 796 MB (`node_modules` 549 MB, `build` 91 MB) | Image around 1 GB. The host was at 94% disk in the evaluation, so **free space first** |
| Database | 1,568 keys for a dozen test threads | Its own PostgreSQL database on the existing Postgres server. Tens of MB for thousands of posts. No Redis needed for a single process |
| Uploads | 1 test image | Separate volume. Images are resized (around 100–300 KB each) and the default size cap is 2 MB, so about 0.3 GB per 1,000 images. Cap the file size and type list |
| Backups | — | Nightly `pg_dump` of the forum database plus the uploads volume, with `config.json` (holds the session secret) in the secrets store |
| Maintenance | — | NodeBB 4.x minor releases about monthly, plus plugin updates. Each upgrade: rebuild the image, run `./nodebb upgrade` (migrations), run the bridge contract tests, and check plugin compatibility ranges |

## 8. Is another engine a better fit?

- **Discourse:** the most complete Q&A (Post Voting, Solved) and moderation, but it is built
  around its own Ember UI, so headless use behind our design is unusual. It is also the
  heaviest to host (2 GB+ RAM and its own launcher) on a host that is short of disk. Choose it
  only if we give up the portal-native design and run `community.redactplus.io` as its own
  themed site.
- **Flarum:** a light PHP stack, but as of the 5 November evaluation, 2.0 was in beta and Q&A
  extension support for 2.0 was unconfirmed. This trial did not re-check that.
- **Building it in the portal backend:** the data model is small, but moderation, flags, search,
  notifications, anti-spam and upload safety would all be ours to build and maintain. NodeBB
  provides all of these today.

**Recommendation:** go ahead with NodeBB on PostgreSQL, headless behind the portal, with the
bridge plugin in §6. Staff keep NodeBB's own UI on a staff-only hostname through Keycloak SSO.
Before any production step: a Keycloak roles mapper, a decision on email linking, and disk
space on the host.

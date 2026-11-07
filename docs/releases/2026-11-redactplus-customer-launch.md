# RedactPlus customer launch: release, owner handoff and acceptance plan

One coordinated launch of the full self-service journey:

redactplus.io → Create account → set-up email → set password (Keycloak, RedactPlus theme) →
home.redactplus.io → licence and credits → installer → desktop sign-in → sign out and back in.

Nothing here has been applied to production. Each phase below has its own checks and rollback.
The owner approves the whole sequence once (section 3), after every item in section 2 is ready.

## 1. Release contents

The release is exactly two pull requests, one per repository, both from a branch named
`feat/redactplus-customer-launch`:

| PR | Repository | Contains |
|---|---|---|
| **Marketing** | Safe-Redact/Marketing-Site | Sign-in fallback for the Download dialog, the forwarder secret, sticky deployment flags, this document |
| **Backend** | Safe-Redact/Admin-panel | Trusted visitor address (forwarder secret) and staff-address guard, RedactPlus customer login theme, SpaceMail SMTP script |

| Component | In | Production today | After launch |
|---|---|---|---|
| Marketing site | Marketing PR | `7c1ff6b` image `sha256:4a52ff7e…` (4 Nov) | merge commit, tag `<sha>-registration` |
| Customer portal | Marketing-Site `main` already (PR #13 wording) | `e5e7954` `sha256:a855304b…` (staff preview) | `main` merge commit, public |
| Control Center API | Backend PR | `:prod` built 6 Nov 16:28 UTC (unlabelled, after `7026a19`) | `:prod` from the merge commit |
| Keycloak customer theme | Backend PR | staff theme for every client | `redactplus` theme on `redactplus-portal` |
| Keycloak SMTP script | Backend PR | unknown (owner to confirm) | SpaceMail, implicit TLS 465 |
| Automatic deployment | Marketing-Site `main` (PR #14) + the sticky-flag fix in the Marketing PR | off | stays off until after the launch |

**Merging the backend PR deploys it.** A push to Admin-panel `main` publishes
`saferedact-control-center-api:prod` and `-web:prod` (`.github/workflows/production.yml`), and
Watchtower on the server (`--label-enable --interval 60 --cleanup`) replaces `saferedact_api` and
`saferedact_admin` within about a minute. With no new settings this is safe: without
`TRIAL_FORWARDER_TOKEN` the API ignores forwarded visitor addresses, registration is still off on
the website, and the theme and realm change only take effect through phase 2's manual steps. Merge
it at the start of the launch window (phase 1), not earlier. Rollback: the previous image is in
the registry as `:sha-7026a19…` (Watchtower's `--cleanup` removes it from the server, so it is
pulled again).

The original per-change branches (`fix/redactplus-sign-in-only-download`;
`fix/trial-trusted-client-address`, `feat/redactplus-customer-login-theme`,
`fix/smtp-script-spacemail`) stay until both PRs are verified and merged, then can be deleted.

### What the branches change
- **Website, sign-in fallback:** while registration is off, the Download dialog is sign-in only (no unusable form,
  no links to unapproved legal pages) and Get Started stays the sales enquiry. With registration on,
  the same dialog offers Create account and Sign in, unchanged.
- **Website, registration security:** backend mode requires `REDACTPLUS_REGISTRATION_FORWARDER_TOKEN` and sends it
  as `X-RedactPlus-Forwarder` with the visitor's `CF-Connecting-IP`.
- **Website, automatic deployment:** unset `MARKETING_REGISTRATION` and `MARKETING_PORTAL_URL` now keep what production
  runs. A routine release can no longer switch registration off or drop the Download entry, and
  registration without the portal URL is refused.
- **API:** the visitor header is honoured only with the shared forwarder secret (optionally also from
  listed networks); otherwise the connection address counts. Staff addresses cannot register
  trials. Misconfiguration stops start-up.
- **Keycloak theme:** `redactplus` login theme (wording only, parent `saferedact`) on the portal client only:
  sign-in, password reset, set-password and error pages say RedactPlus Home, not Admin Panel.

### Visitor-address chain (verified 7 Nov, except where noted)
1. Cloudflare sends `CF-Connecting-IP` to nginx on `redactplus.io`.
2. nginx `real_ip` (stage M; **not live yet**) accepts it only from Cloudflare's published ranges
   (22 ranges, checked equal to Cloudflare's lists). A direct caller's header is ignored.
3. nginx sets `X-Forwarded-For $remote_addr` (overwrites; a client cannot inject) and proxies to the
   app on `127.0.0.1:6095`. The app takes exactly one hop (`TRUST_PROXY_HOPS=1`).
4. The app calls `https://api.saferedact.io/public/trial-registrations` from the container
   (measured source `10.0.19.2`) with `CF-Connecting-IP` and the forwarder secret.
5. nginx in front of the API appends `X-Forwarded-For`; the API listens on `127.0.0.1:8110` only
   and resolves the last hop. It trusts `CF-Connecting-IP` only with the secret.

A public caller can therefore never choose the address the trial limits use. The website's address
can change (container recreated, network renumbered) without breaking or weakening this.

### Build arguments and runtime settings at launch
| Where | Setting | Value |
|---|---|---|
| Marketing build | `NEXT_PUBLIC_PORTAL_URL` | `https://home.redactplus.io` |
| Marketing build | `NEXT_PUBLIC_REDACTPLUS_REGISTRATION` | `enabled` (tag gets `-registration`) |
| Marketing build | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the widget's public site key (owner) |
| Marketing build | `NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH` | unset (sign-in stays the Keycloak redirect) |
| Marketing `app.env` | `TRUST_PROXY_HOPS` | `1` |
| Marketing `app.env` | `REDACTPLUS_REGISTRATION_MODE` | `backend` |
| Marketing `app.env` | `REDACTPLUS_REGISTRATION_API_URL` | `https://api.saferedact.io/public/trial-registrations` |
| Marketing `app.env` | `REDACTPLUS_REGISTRATION_FORWARDER_TOKEN` | shared secret (section 2, H2) |
| API `.env` | `TRIAL_FORWARDER_TOKEN` | the same shared secret |
| API `.env` | `TURNSTILE_SECRET` | the widget's secret (owner) |
| API `.env` | `TRIAL_WEBSITE_ORIGINS` | default (`https://redactplus.io;https://www.redactplus.io`) |
| Keycloak | `redactplus-portal` → Login theme | `redactplus` |
| Keycloak | Realm SMTP | SpaceMail via `scripts/set-smtp.sh` |

## 2. Owner handoff: everything that needs a person, in one list

Never paste a secret into chat, a ticket or a pull request. Every value below goes straight into
the server file or console named.

| # | Item | Who | Exact action | Validation |
|---|---|---|---|---|
| H1 | Review the two pull requests | Product owner, backend developer | Review both PRs and get CI green. Merge the Marketing PR before the window; merge the Backend PR at the start of phase 1 (it deploys itself) | `main` of each repository contains its `feat/redactplus-customer-launch` head |
| H2 | Forwarder secret | Operator on the server | `openssl rand -hex 32` once; put it in the API `.env` as `TRIAL_FORWARDER_TOKEN` and in `/root/deploy/redactplus-landing/app.env` as `REDACTPLUS_REGISTRATION_FORWARDER_TOKEN` (both mode 600) | API starts; the marketing route answers 503 `registration_unavailable` until its own config is complete, never a configuration error in its log |
| H3 | SpaceMail SMTP for Keycloak | Owner with the `no-reply@redactplus.io` mailbox password; backend developer | On the server in the Control Center checkout: `SMTP_HOST=mail.spacemail.com SMTP_PORT=465 SMTP_SSL=true SMTP_REPLY_TO=support@redactplus.io bash scripts/set-smtp.sh no-reply@redactplus.io` (password at the prompt) | Keycloak admin → Realm settings → Email → **Test connection** succeeds; a test email arrives with DKIM `d=redactplus.io` pass and SPF pass. DNS already verified 7 Nov: SPF includes SpaceMail, DKIM selector `spacemail` exists, MX is SpaceMail, DMARC `p=none` |
| H4 | Cloudflare Turnstile | Owner (Cloudflare dashboard) | Create or confirm a widget for `redactplus.io` and `www.redactplus.io` (Managed). Give the **site key** to the marketing build and put the **secret** in the API `.env` as `TURNSTILE_SECRET` | The candidate page loads the widget without a "testing only" banner; a registration with a deliberately missing token is refused with the security-check message |
| H5 | Trial organisation and licence | Platform Owner (Control Center → **Trials**) | Choose the trial organisation; it needs an **active Trial package subscription** with a future period end | `/public/trial-registrations` no longer answers `unavailable`; the QA registration (section 4, T1) creates a member of that organisation with a Trial seat |
| H6 | Legal text | Product owner and legal | Replace every placeholder at `admin.redactplus.io/terms` and `/privacy` (list below) and add to the Terms that customers must be **18 or older** | Both pages contain no `[` placeholders and state 18+; the registration consent links to them |
| H7 | Stage M (marketing real-IP) | Product owner approves; operator applies | `deployment/redactplus/nginx/REAL-IP-CHANGE.md` | `/api/health` unchanged; the marketing access log shows visitors' own addresses, not Cloudflare's |
| H8 | Customer theme on the live realm | Backend developer | Copy `ops/keycloak/themes/redactplus` to the server checkout, restart the identity container, then Clients → `redactplus-portal` → Login settings → Login theme `redactplus` | Portal sign-in page shows "RedactPlus Home", no "Admin Panel"; the Admin Panel sign-in is unchanged |
| H9 | QA identities | Product owner | One new mailbox never used for a trial (for example `trial-test@redactplus.io`), and one network and Windows computer to spend trial allowances on | Used only for section 4 |
| H10 | The first customer's account | Product owner | `first-customer-account-check.md` (console or read-only SQL) | Active user, organisation and subscription; Keycloak email verified, no pending actions |
| H11 | Cloudflare WAF rule for the controlled window | Owner (Cloudflare) | Temporary custom rule on `redactplus.io`: URI path starts with `/api/registration` AND source IP not in {QA addresses} → Block | From another network, a registration answers "wasn't confirmed" and nothing is created |

**Legal placeholders found on 7 Nov:**
- **Terms:** registered company name, term, notice period, payment terms, support policy or SLA, contact email, jurisdiction, **18+ clause**.
- **Privacy:** registered company name, country, company number, registered address, contact email, data-protection contact, retention period, hosting provider, hosting country or region, email provider, applicable region, transfer mechanism.

None of these can be invented.

## 3. Coordinated launch sequence (one approval, one window, about 90 minutes)

Order matters: each phase only depends on the ones before it, and public registration is the last
switch. Stop at the first failed check and roll that phase back.

| Phase | Action | Checks | Rollback |
|---|---|---|---|
| 0 | Snapshot: `docker ps`, `nginx -t`, `df -h /` (≥ 8 GB free), back up the API `.env`, the marketing `app.env` and the portal nginx site | — | — |
| 1 | **API**: merge the Backend PR (Watchtower deploys `:prod`), then add `TRIAL_FORWARDER_TOKEN` and `TURNSTILE_SECRET` (H2, H4) and recreate the API container | `/health` ok; `POST /public/trial-registrations` with `CF-Connecting-IP` but no secret is rate-limited against the caller's own address (send 11 from one host: 429) | Pin the API to `:sha-7026a19…` (or the previous `sha-` tag) and restore the `.env` backup |
| 2 | **Keycloak**: SMTP (H3), customer theme (H8) | Test connection; portal sign-in page wording; Admin Panel sign-in unchanged | Clear the client's login theme; restore the previous SMTP from the backup |
| 3 | **Portal**: deploy `main`, then stage I (public site) | Health `ready` and commit; non-staff `/` redirects to sign-in; direct origin 403; `/forum` 404 | `.env.previous`; reinstall the preview site |
| 4 | **Stage M** (H7) | Marketing health and real visitor addresses in the log | Restore the nginx backup and reload |
| 5 | **Marketing**: add H11's WAF rule first; then build the launch merge commit with the section 1 build arguments, set the `app.env` registration lines, deploy | Health commit; Download opens Create account and Sign in; Turnstile renders; a non-QA registration is blocked by the WAF rule | `.env.previous` (`7c1ff6b`); or remove `REDACTPLUS_REGISTRATION_MODE` from `app.env` and restart (form answers "unavailable", creates nothing) |
| 6 | **Acceptance**: section 4, T1–T12, with the H9 identities | All pass | Phases 5 → 1 in reverse |
| 7 | **Public**: remove the WAF rule | One more registration from a non-QA network succeeds | Re-add the rule |

Automatic deployment stays off (`CD_ENABLED` unset) through the launch. Switch it on afterwards
(`deployment/cd/README.md`): with the sticky-flag fix it rebuilds marketing with registration on
and the portal URL set, because that is what production then runs.

## 4. End-to-end acceptance plan

**A = automated** (runs in CI or locally, no production). **L = live** (production, real identities,
real emails).

| # | Area | A: automated coverage (status 7 Nov) | L: live steps and expected result |
|---|---|---|---|
| T1 | First-time registration | Website: field validation, no password collected, consent includes 18+, only a 202/accepted shows success (`registration-onboarding.test.ts`, 28 pass). API: creates a trial member with its own seat (`TrialTests`, pass) | QA mailbox via redactplus.io → Download → Create account: success screen names the mailbox; staff Trials page shows the trial "Not started" with the **tester's public IP** |
| T2 | Duplicate account | Website maps resent, trial_used and existing_customer. API: Gmail aliases, an ended trial, a paying customer and a **staff address** all refused (pass) | Same mailbox again: "sent again"; a customer's address: "already has an account"; a staff address: refused, no email |
| T3 | Password-setup email | API sends VERIFY_EMAIL + UPDATE_PASSWORD with the portal client and `/welcome` (source) | Email arrives (SpaceMail, DKIM pass), RedactPlus wording; link expires after its lifetime |
| T4 | Customer Keycloak login | Realm test: portal client uses `redactplus`, staff keep `saferedact`; portal is a public PKCE client | Set password on the RedactPlus-themed page → lands on `/welcome` → home signed in without a second password prompt |
| T5 | Portal licence and credits | Portal route suite (stand-in `/portal/me`) | Home shows Trial, Not started, start about 14 days out; credits 40/40/20 |
| T6 | Installer download | Portal download allow-list (github.com only) | Download redirects to the GitHub release asset; file size matches the release |
| T7 | Desktop activation | Desktop `DeviceTakeoverDesktopTests` (activation path) | Install, sign in with the same email and password: licensed; portal home now shows Active with an end date 7 days later |
| T8 | Logout and returning login | Portal sign-out route tests | Sign out → `/signed-out`; Download → Sign in → home without re-registering |
| T9 | Password reset | Keycloak `resetPasswordAllowed` (realm test) | "Forgot your password?" on the RedactPlus page → email → new password works in portal and desktop; the old one fails |
| T10 | Admin Panel and cross-organisation denial | `CustomerExposureTests` (pass): customer roles cannot reach platform operations; reports cannot be widened to another organisation | As the QA customer: `admin.redactplus.io/vendor`, `/vendor/staff`, `/vendor/plans` → "No access to this page"; the Organisation page shows only the trial organisation's own data; `/portal/me` returns only the caller |
| T11 | Trial expiry and enforcement | `TrialTests`: term, per-network and per-computer limits, licence end | Staff "End now" on the QA trial → desktop refuses new work at licence end, portal shows Ended; a fourth trial from the QA network is refused "too many from this location" |
| T12 | Mobile and desktop browsers | Dialog layout at 375 px and desktop checked locally (no overflow, 16 px margins, labelled dialog) | Chrome desktop, Safari iOS, Chrome Android: Download → both tabs → Turnstile → success; sign-in round trip |

Evidence to keep for each live test: time, identity used (never its password), screenshot, and the
matching log line (marketing request id, API audit entry or Keycloak event).

After T1–T12 pass, the product owner runs the same journey as a customer for final acceptance.

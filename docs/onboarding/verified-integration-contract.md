# Trial onboarding: verified integration contract

Marketing site (`redactplus.io`), customer portal (`home.redactplus.io`), Control Center API
(`api.saferedact.io`), Keycloak (`admin.redactplus.io/identity`) and RedactPlus Desktop.

Established 6 November 2026 from the code as it is, not from earlier proposals. It supersedes
`backend-registration-contract.md` and `../portal/backend-integration-boundary.md`, which
described endpoints that were never built.

## Sources inspected

| Repository | Ref | Commit | How |
|---|---|---|---|
| Admin Panel / Control Center (`Safe-Redact/Admin-panel`) | `origin/main` | `7026a19ab091a8d9c6f793f465d009fd30cd0a76` (merge of PR #29 `feat/trial-onboarding`) | Detached read-only worktree; local `main` fast-forwarded from `ee60d16` |
| RedactPlus Desktop (`Safe-Redact/redact`) | `origin/develop` | `8e751012021c1cc99cf324dffa7c3669890a6ec1` | Detached read-only worktree; local `develop` fast-forwarded from `be61394` |
| Marketing site (`Safe-Redact/Marketing-Site`) | `feat/redactplus-email-onboarding` | `68c7fa5` plus uncommitted work | This working tree |

Checks run:
- **Backend tests.** `dotnet test --filter TrialTests|KeycloakRealmTests|KeycloakThemeTests` in
  the worktree: **30 passed, 0 failed**.
- **Live system.** Read-only, unauthenticated requests on 6 November 2026. No account, trial or
  licence was created.

## Status legend

| Label | Meaning |
|---|---|
| **SOURCE** | Verified by reading the backend implementation |
| **TESTED** | Verified by a backend test that ran and passed (above) |
| **LIVE** | Verified against the running production system with a read-only, unauthenticated request |
| **NOT IMPLEMENTED** | No code exists for it |
| **CONFIRM** | Requires backend or operations confirmation; could not be verified here |

There is no staging environment of the Control Center or Keycloak. Nothing below is "verified
through staging integration".

## 1. Registration

`POST https://api.saferedact.io/public/trial-registrations` (`TrialApi.cs`).

| Aspect | Behaviour | Status |
|---|---|---|
| Deployed | `GET /portal/me` answers 401 and the registration preflight answers 204: the trial API is running in production | LIVE |
| Authentication | None. No service credential exists; the website must not send one | SOURCE |
| Bot check | Cloudflare **Turnstile** token in `turnstileToken`, verified server side with `TURNSTILE_SECRET`. Outside the Development environment, a missing secret makes **every** registration fail with an `invalid` / `turnstileToken` error | SOURCE |
| CORS | `https://redactplus.io`, `https://www.redactplus.io`; POST; `Content-Type` only. Not relevant to a server-to-server call | SOURCE, LIVE (preflight 204) |
| Rate limit | 10 requests per 15 minutes per client address; then an empty-bodied 429 | SOURCE |
| Client address | `CF-Connecting-IP` header if present and parseable, otherwise the connection address | SOURCE |
| Request | `{ fullName, email, organisationName?, acceptedTerms, turnstileToken }` | SOURCE, TESTED |
| Validation | `fullName` 1–200 characters, no control characters. `email` must be a valid address and not a throwaway domain. `organisationName` ≤ 200. `acceptedTerms` must be true, and its message states 18 or older | SOURCE, TESTED |
| Duplicates | Compared after lower-casing, and for Gmail without dots or `+tags`. A second registration whose trial still grants access answers `resent` and resends at most once per 10 minutes. After the trial it answers `trial_used`. A concurrent duplicate becomes `resent` (unique index) | SOURCE, TESTED |
| Existing customer | Any address already a Control Center user answers `existing_customer` | SOURCE, TESTED |
| Per-network limit | At most 3 trials per client address within a staff-set window (default: for ever); the 4th answers `too_many_from_location` (429) and is recorded | SOURCE, TESTED |
| Trials switched off | No trial organisation chosen, or no active Trial package subscription → `unavailable` (503) | SOURCE, TESTED |
| Response | Always `{ code, message, errors }` | SOURCE |

| HTTP | `code` | Website behaviour |
|---|---|---|
| 200 | `accepted` | "Check your email" |
| 200 | `resent` | "Check your email", worded as already registered and sent again |
| 400 | `invalid` | Errors under the fields: `fullName`→name, `email`, `organisationName`→organization, `acceptedTerms`→consent, `turnstileToken`→security check |
| 409 | `trial_used` | Message with support and sales links |
| 409 | `existing_customer` | Message with a Sign in action |
| 429 | `too_many_from_location` | "Too many trials have been started from this location" |
| 429 | (no body) | "Too many attempts", honouring Retry-After |
| 503 | `unavailable` | "Trials can't be started right now, and nothing was created" |
| 503 | `email_failed` | **Not a success.** "Your email didn't go out", with **Send it again** |
| other, or unreachable | — | Failure; never success |

### Resend

`POST /public/trial-registrations/resend` with `{ email }`. It always answers 200 `resent`, so it
reveals nothing. It sends only for an enrolment whose trial still grants access, at most once per
10 minutes. SOURCE.

### Provisioning sequence

`TrialService.RegisterAsync`; SOURCE, and TESTED by
`A_registration_creates_a_member_of_the_trial_organisation_with_its_own_seat_and_sends_the_welcome`.

1. Validate, then check duplicates, existing users, that a trial organisation and an active
   **Trial** package subscription exist, and the per-network limit.
2. Create a `User` (Member, Invited) in the **shared trial organisation**, a `Seat` of the Trial
   plan, and a `TrialEnrolment` holding the individual term, the organisation name the person
   typed, the registration address and the terms timestamp. Raise the subscription's seat count
   when needed. Audit `TrialRegistered`.
3. Call Keycloak through the admin API. Find or create the user, set attribute
   `redactplus_signup=trial`, and call `execute-actions-email` with `VERIFY_EMAIL` and
   `UPDATE_PASSWORD`:
   - link lifetime **72 hours**;
   - `client_id=redactplus-portal`;
   - `redirect_uri=https://home.redactplus.io/welcome` (`PORTAL_WELCOME_URL`).
4. The email was sent → `accepted`. It failed → `email_failed`; the enrolment stays, and resend
   retries it.

## 2. Email and password set-up

| Aspect | Behaviour | Status |
|---|---|---|
| Who triggers it | The Control Center, during registration and resend | SOURCE |
| Who sends it | **Keycloak**, through the realm's SMTP settings | SOURCE |
| Template | Realm theme `saferedact`, `email/html|text/executeActions.ftl`, branch `redactplus_signup == "trial"`: heading "Welcome to your Redact Plus trial", button "Set your password", trial facts, 72-hour expiry, support address | SOURCE, TESTED (`KeycloakThemeTests`) |
| Website templates (`docs/onboarding/email/`) | **Superseded.** The backend wrote its own trial branch keyed on `redactplus_signup`, not the `rpOnboarding` variable ours used. Do not install ours alongside | SOURCE |
| Sender | `IDENTITY_SMTP_FROM`; the realm's `replyTo` equals `from` on `main` | SOURCE |
| SpaceMail | On `main`, `scripts/set-smtp.sh` defaults to Hostinger with STARTTLS. Implicit TLS on 465 and a separate reply-to are on the **unmerged** branch `origin/fix/smtp-script-spacemail` (`270e481`). The backend document's "from no-reply@, replies to support@" depends on the live realm settings | CONFIRM |
| Delivery failure | An admin-API or SMTP failure while sending → `email_failed` (503). The address is logged by the backend (`LogWarning … {Email}`) | SOURCE |
| Password page | Keycloak's own action-token page, themed `saferedact`. Policy: `length(14)`, upper, lower, digit, special, not the username, history 5 | SOURCE |
| After set-up | Keycloak returns to `https://home.redactplus.io/welcome` through the registered client. **No authorization code or token is delivered there**; a portal session must be established by OIDC | SOURCE |
| Expired or used link | Handled by Keycloak's action-token pages. Resend issues a fresh link | SOURCE (Keycloak behaviour), not tested here |
| Portal client on the live realm | Present: the public authorize endpoint renders the sign-in page for `redactplus-portal` with `redirect_uri=https://home.redactplus.io/welcome` and S256. It rejects a foreign redirect URI | LIVE |

## 3. Portal sign-in and customer identity

| Aspect | Behaviour | Status |
|---|---|---|
| Issuer | `https://admin.redactplus.io/identity/realms/saferedact` | LIVE (discovery) |
| Client | `redactplus-portal`. **Public** (no secret), standard flow only, PKCE S256 required. Redirect and post-logout URIs `https://home.redactplus.io/*`; web origin `https://home.redactplus.io` | SOURCE, LIVE |
| Self-registration | Off (`registrationAllowed: false`), so the portal must not send `prompt=create` | SOURCE |
| Identity API | `GET /portal/me` with `Authorization: Bearer <access token>`. The JWT is checked for issuer, lifetime and signature, and the policy requires `azp == redactplus-portal`; audience is not checked | SOURCE, LIVE (401 without a token) |
| Account lookup | By `sub`; otherwise once by a **verified** email, which then links the subject and activates an Invited user | SOURCE |
| Response | `{ email, displayName, organisation, provisioned, licence{code,type,package,active,validUntil}?, trial{status,activated,registeredAt,startsAt,endsAt,credits[]}? }`; 404 `account_not_found` | SOURCE, TESTED (`PortalProfile.BuildAsync` in the isolation test) |
| Trial members | See only their own trial. `organisation` is the name they typed, never the shared trial organisation | TESTED (`A_trial_member_sees_only_their_own_trial…`) |
| `PATCH /portal/me` | `{ displayName }`, 1–200 characters; also updates Keycloak | SOURCE (not used by the portal yet) |
| Password change | Keycloak account page or `kc_action=UPDATE_PASSWORD`; never the portal | SOURCE |

## 4. Trial and licensing

| Rule | Behaviour | Status |
|---|---|---|
| Organisation | One shared trial organisation, chosen by a platform Owner on **Trials**. It needs an active subscription to the **Trial** package on per-user credits | SOURCE, TESTED |
| Isolation | Each person has their own user, seat, enrolment, term and credit wallet. One trial activating or spending touches no other | TESTED (`One_trial_member_activating_or_spending_does_not_touch_another`) |
| Term | **7 days** from the first desktop licence issued. With no desktop sign-in, it starts by itself **14 days** after registering. Staff can extend it by 1–90 days, end it, or block it | TESTED |
| Individual or shared | Individual (per enrolment) | TESTED |
| Licence | Trial plan; entitlements as Document + Media. The licence expiry is cut at the trial end and never renewed after it; no air-gapped key | TESTED |
| Cloud credits | 100 per person, not shared: 40 documents, 40 video and images (pictures count here), 20 audio (including transcript translation). A request past an allowance is refused | TESTED |
| Device limits | **3 trial accounts per computer** (fingerprint) within the window; the 4th activation is refused. The per-seat device limit comes from the plan (`MaxDevicesPerSeat`, default 2), and a second computer needs the sign-in takeover confirmation (issue #204) | TESTED (per computer); CONFIRM (the Trial plan's per-seat value) |
| Paid customers | `existing_customer` at registration. `GET /portal/me` returns `trial: null` and their subscription's licence | TESTED (registration); SOURCE (profile) |
| Duplicate trials | Prevented by normalised email, a unique index and `trial_used` after the end | TESTED |
| Ended trial | Desktop licence refused or not renewed ("Your Redact Plus trial has ended…"); cloud requests refused; files stay local | TESTED |

## 5. Desktop (`develop` 8e75101)

| Aspect | Finding | Status |
|---|---|---|
| Sign-in | Email and password to `POST https://api.saferedact.io/v1/api/activation/authorize`, with fingerprint, machine name, OS and `deviceTakeover: "confirm"`. The password is used once and not stored | SOURCE (desktop) |
| Credential check | The Control Center calls Keycloak's token endpoint with `grant_type=password` on the activation client (direct access enabled), then `userinfo`. The same Keycloak password works in the portal and the desktop | SOURCE (backend) |
| Unfinished set-up | Until `VERIFY_EMAIL` and `UPDATE_PASSWORD` are done, Keycloak refuses the password grant, so the desktop cannot sign in. Finishing the email link is required, and nothing else | SOURCE (Keycloak behaviour) |
| Trial recognition | None in the desktop: it receives a licence or the server's refusal text. The trial term starts server side at the first issued licence | SOURCE |
| Expiry | The licence token's expiry is enforced locally. An expired licence can still **export finished work** but not start new work (R-4.6); the backend document says "the desktop stops" | SOURCE (wording difference only) |
| Seven-day trial | Supported through the licence expiry the server issues; no desktop change needed | SOURCE |
| Extra onboarding action | None beyond finishing the set-up email | SOURCE |

## 6. Security notes for the backend team

1. **`CF-Connecting-IP` is trusted from anyone.** `api.saferedact.io` is not proxied by Cloudflare
   (it resolves to the origin, 31.97.42.73), and `ClientIp.Of` accepts the header from any caller.
   So the 10-per-15-minutes limit and the 3-trials-per-network rule can be bypassed by anyone who
   sends the header. Recommendation: trust it only from known proxies (for example the marketing
   container or host loopback), or put the API behind Cloudflare and accept the header only from
   Cloudflare ranges. **The website relies on the header being honoured for its own forwarded
   value; agree the mechanism before changing it.**
   **Agreed and implemented (7 Nov 2026, not yet deployed):** the API honours the header only with
   a shared forwarder secret (`TRIAL_FORWARDER_TOKEN` / `REDACTPLUS_REGISTRATION_FORWARDER_TOKEN`,
   sent as `X-RedactPlus-Forwarder`); Admin-panel `fix/trial-trusted-client-address`.
2. **Personal data in logs.** `TrialService` and `KeycloakIdentityAdministrator` log the email
   address on failures and concurrent registrations.
3. **Brand.** Backend emails and pages write "Redact Plus" (two words); the website writes
   "RedactPlus".

## 7. How the website integrates (this branch)

- **Server-side, same-origin.** The browser posts `{ name, email, organization, consent,
  turnstileToken }` to `/api/registration`. That route validates, applies its own honeypot and
  rate limits, then calls the Control Center from the server
  (`src/lib/onboarding/adapter.ts`).
- **Visitor address.** The route sends the visitor's address as `CF-Connecting-IP`, taken from
  `TRUST_PROXY_HOPS`, never from a client header. **Prerequisite:** the marketing nginx real-IP
  change (`deployment/redactplus/nginx/REAL-IP-CHANGE.md`). Without it the forwarded address is a
  Cloudflare edge address, and the backend's 3-per-network rule would block real visitors in
  groups.
- **Turnstile.** The widget renders inside the form; its origin is added to `script-src` and
  `frame-src` only when live registration is built with a site key. The token is single use, kept
  only in memory, and reset after every submission.
- **No password.** The website never touches set-up tokens, passwords or Keycloak admin APIs.
- **Portal.**
  - The public client with PKCE: no secret, and no `prompt=create`.
  - `/welcome` starts the ordinary OIDC sign-in, or goes home when a session exists. It never
    assumes the set-up page created a session.
  - The home page shows `GET /portal/me` (licence, trial status, credits) server side; the access
    token never reaches the browser.

## 8. Not implemented, or open

| Item | Status |
|---|---|
| Staging Control Center and Keycloak | NOT IMPLEMENTED: no environment to integrate against without touching production |
| `TURNSTILE_SECRET` set on the production API; Turnstile widget and site key created | CONFIRM. Without both, every registration fails |
| Trial organisation chosen, and its Trial package subscription active | CONFIRM. Otherwise `unavailable` |
| Realm SMTP pointed at SpaceMail (implicit TLS, sender, reply-to) | CONFIRM (fix branch unmerged) |
| Terms page states the 18+ requirement (the backend requires it) | CONFIRM. The legal pages still carry placeholders |
| A test run of the HTTP layer (status codes, CORS, Turnstile, `azp` policy) | NOT IMPLEMENTED in backend tests (source only) |
| Website calls `PATCH /portal/me` | NOT IMPLEMENTED (not needed for launch) |

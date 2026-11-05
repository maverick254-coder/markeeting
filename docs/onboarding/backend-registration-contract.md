# RedactPlus customer registration: backend contract (PROPOSED)

For the Admin Panel / Control Center team. Prepared 6 November 2026, from read-only inspection of
Admin-panel `origin/main` `a5f16f8`. Nothing in the Admin Panel, Keycloak or the licensing
database was changed.

The website side is built and tested against this contract. With no backend it fails closed:
`POST /api/registration` answers `503 registration_unavailable`, the Download dialog says
registration isn't available, and it never shows "Check your email".

## 1. Journey and ownership

```
redactplus.io  Download → Create account (full name, email, organization optional, consent)
   │  POST /api/registration (same origin, validated, rate limited)
   ▼
marketing server ── POST {REDACTPLUS_REGISTRATION_API_URL} (server to server, service token) ──▶ Control Center
                                                                                                  │ create or link Keycloak user
                                                                                                  │ link to the trial organization
                                                                                                  │ execute-actions-email
                                                                                                  │   [VERIFY_EMAIL, UPDATE_PASSWORD]
                                                                                                  │   client_id=redactplus-portal
                                                                                                  │   redirect_uri=https://home.redactplus.io/
                                                                                                  ▼
customer inbox ◀── "Welcome to RedactPlus — Set Up Your Account" (Keycloak SMTP, no-reply@redactplus.io)
   │  link = Keycloak action token
   ▼
Keycloak (RedactPlus login theme): confirm email, choose password (realm policy)
   │  redirect_uri
   ▼
home.redactplus.io/ → no session → /auth/start → Keycloak (SSO session present) → /auth/callback → portal session
```

| Concern | Owner |
|---|---|
| Identity creation or linking, duplicate detection | Backend |
| Trial organization membership, licence, seat, trial start and end | Backend |
| Set-up token generation, lifetime, single use | Keycloak (action token), triggered by the backend |
| Set-up email content and delivery | Keycloak SMTP, using the RedactPlus email theme (templates in `docs/onboarding/email/`) |
| Password policy, storage, brute-force protection | Keycloak |
| Portal session | Portal (`apps/portal`) via its existing OIDC flow |
| Form, validation, abuse limits, honest UI states | Website |

The website never creates identities, calls Keycloak's administrative API, generates or receives
tokens, sends the set-up email, or handles a password during registration.

## 2. `POST` registration

The URL is configured as `REDACTPLUS_REGISTRATION_API_URL`. Proposed:
`https://admin.redactplus.io/v1/api/customer-onboarding/registrations`.

**Request headers**
- `Authorization: Bearer <REDACTPLUS_REGISTRATION_API_TOKEN>`: a service credential that can call
  only this endpoint and the resend endpoint. It is **not** a Keycloak admin credential. It is held
  server-side in the marketing server's environment and is never sent to a browser.
- `Content-Type: application/json`
- `Idempotency-Key: <uuid>`: one per submission. Treat a repeat with the same key as the same
  request.
- `X-Request-Id: <uuid>`: for correlating logs.

**Body**

```json
{
  "fullName": "Ada Lovelace",
  "email": "ada@example.com",
  "organization": "Example Agency",
  "consent": {
    "termsAndPrivacy": true,
    "acceptedAt": "2026-11-06T09:30:00.000Z",
    "termsUrl": "https://admin.redactplus.io/terms",
    "privacyUrl": "https://admin.redactplus.io/privacy"
  },
  "source": "redactplus.io/download",
  "clientAddress": "203.0.113.7"
}
```

- `email` is trimmed and lower-cased. `organization` is `null` when not given.
- `clientAddress` is `null` unless the website's trusted proxy chain is configured
  (`TRUST_PROXY_HOPS`). Use it only for abuse controls.
- Limits enforced by the website: name ≤ 200, email ≤ 254, organization ≤ 120, with no control
  characters.

**Success: `202 Accepted`** (200 and 201 are also accepted)

```json
{
  "status": "accepted",
  "setupEmail": "queued",
  "resendAvailable": true,
  "trial": { "status": "pending", "lengthDays": 7, "startsAt": null, "endsAt": null }
}
```

- `setupEmail`: `queued` if the email is sent asynchronously, or `sent` once
  `execute-actions-email` returned success. The website words these as "We're sending…" and
  "We've sent…". It never claims delivery.
- `resendAvailable`: whether a resend is possible for this registration.
- `trial`: optional and nullable. The website shows an end date only when `status` is `active` and
  `endsAt` is set. Otherwise it describes a seven-day temporary trial without dates.

**Required behaviour**
- **No account enumeration.** Return the same `202` whether or not the email already has an account.
  For an existing account, send a "you already have an account, sign in or reset your password"
  email instead of creating a duplicate, or re-send set-up if it was never completed.
- Set the Keycloak user attribute `redactplus_onboarding=website-trial` before calling
  `execute-actions-email`. The email template uses it to choose the registration design;
  invitations keep today's wording.
- Store `fullName` in Keycloak `firstName`/`lastName`, as the backend already does for display names.
  The template greets with both.
- Set the trial-detail attributes (`redactplus_trial_*`, see `email/keycloak/html/executeActions.ftl`)
  only with confirmed values.
- Call `execute-actions-email` with `client_id=redactplus-portal` and
  `redirect_uri=https://home.redactplus.io/`. Register that exact URI on the client. The portal's
  `/` route sends a visitor without a session through its normal OIDC sign-in; with Keycloak's SSO
  session from the set-up flow, that completes without another form.
- Apply backend abuse rules: one trial per verified email, disposable-domain policy, per-address
  limits, and so on.

**Errors** (`{ "error": "<code>", "message"?: "…", "fields"?: { "email": "…" } }`)

| Status | `error` | Website shows |
|---|---|---|
| 400/422 | `invalid_input` (+ `fields` keyed `fullName`, `email`, `organization`) | the field messages |
| 403 | `registration_closed` | registrations paused, contact sales |
| 422 | `not_eligible` / `trial_not_eligible` | can't start a trial, contact support |
| 429 | (any), with `Retry-After` | wait and retry |
| 503 | (any) | unavailable, nothing created |
| other | (any) | not confirmed, try again |

The website treats a timeout (8 s by default), a network error, a redirect or a malformed success
body as **not registered**.

## 3. `POST` resend (optional)

Configured as `REDACTPLUS_REGISTRATION_RESEND_URL`. Proposed:
`…/v1/api/customer-onboarding/registrations/resend`. If it is not configured, the success dialog
shows no resend button.

- Headers: as in §2, without `Idempotency-Key`.
- Body: `{ "email": "ada@example.com" }`
- `202` **always**, whether or not a pending registration exists. Re-issue `execute-actions-email`
  only for an account whose password is still unset.
- `429` with `Retry-After`.

Website limits on top: per address, 3 per 10 minutes; per email, 2 per 15 minutes; a 60-second
cooldown in the UI.

## 4. Website password form (NOT NEEDED with the Keycloak flow)

The supported flow sets the password on Keycloak's `UPDATE_PASSWORD` page, so no website API is
required. If the team ever prefers a website form instead, it would need all of the following.
The UI design is ready (`/prototypes/set-password` in development); `PasswordSetupAdapter` in
`src/lib/onboarding/password-setup.ts` is the typed boundary.

- `POST …/password-setup/inspect` with `{ token }` → `{ state: "valid" | "expired" | "invalid" | "used" }`
- `POST …/password-setup` with `{ token, password }` → `204`, `410 expired`, `409 used`,
  `404 invalid`, `422 password_rejected`.
- The backend would issue its own single-use, short-lived token. The website would read it from the
  URL fragment, never log it, and never store it or the password. The backend sets the password
  through Keycloak.
- After success, the visitor still signs in through the portal's OIDC flow. Setting a password does
  not create a portal session.

## 5. Website configuration

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_REDACTPLUS_REGISTRATION=enabled` | build | lets the dialog submit (default: disabled, with a labelled fallback) |
| `REDACTPLUS_REGISTRATION_MODE=backend` | server runtime | selects the backend adapter (unset means 503) |
| `REDACTPLUS_REGISTRATION_API_URL` | server runtime | §2 endpoint, HTTPS only |
| `REDACTPLUS_REGISTRATION_RESEND_URL` | server runtime, optional | §3 endpoint, HTTPS only |
| `REDACTPLUS_REGISTRATION_API_TOKEN` | server secret | service credential (SECRET) |
| `REDACTPLUS_REGISTRATION_TIMEOUT_MS` | server runtime, optional | 1000 to 15000, default 8000 |
| `TRUST_PROXY_HOPS` | server runtime | per-address rate limits (already used by the contact form) |

`REDACTPLUS_REGISTRATION_MODE=demo` is a local UI demonstration that works only under `next dev`.
In any other runtime it is refused and the route answers 503.

## 6. Decisions still open

1. **When the trial starts:** at registration, at password set-up, or at first desktop activation.
   The email's `trialStartSentence` waits on this.
2. **Trial package** (`document` or `document_media`) and device allowance.
3. **The trial organization.** The brief says "manually configured". Confirm whether every website
   registration joins one shared trial tenant or gets its own. Activation refuses identities in more
   than one organization, so this determines what happens when a trial user is later invited into a
   paying organization.
4. **`LicenceTerm`** has nothing shorter than `OneMonth`. A seven-day term needs `Custom` or a new
   value.
5. **Realm `registrationAllowed: false`** can stay false. This flow creates users through the
   backend, not through Keycloak self-registration.

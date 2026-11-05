# RedactPlus portal ↔ Control Center: integration boundary

For the backend (Control Center / identity) team. Prepared 5 November 2026 from read-only
inspection:
- Admin-panel `origin/main` `59a34dc`;
- desktop `origin/develop` `49cfff0`;
- the public endpoints `…/realms/saferedact/.well-known/openid-configuration` and
  `GET https://api.saferedact.io/v1/api/activation/methods`.

Nothing in the admin panel, licensing database, desktop application or Keycloak configuration
was changed.

The portal (`apps/portal`) is built against this boundary. It works today without any of the
items below. Sign-in reports itself unavailable, licence status reads "not shown yet", and no
trial is ever claimed.

## 1. Verified today (no work needed)

| Capability | Where |
|---|---|
| Keycloak realm `saferedact` at `https://admin.redactplus.io/identity` | discovery returns 200 |
| Desktop email/password sign-in via Keycloak direct grant | `POST /v1/api/activation/authorize`; live `activation/methods` returns `directCredentials: true` |
| Activation refuses unverified email, no organisation, more than one organisation, suspended accounts and staff | `ActivationApi.cs` |
| Invite and reset emails sent by Keycloak; Safe Redact never handles passwords | `IIdentityAdministrator` |
| Licence types `document`, `document_media` | `LicenceTypes.cs` |
| Licence terms `OneMonth` … `TwoYears`, `Custom` | `LicenceTerm.cs` |

## 2. Needed for Phase 1 in staging and production

**Keycloak client `redactplus-portal`:**
- confidential;
- Standard Flow only, with Direct Access Grants **off**;
- PKCE `S256` required;
- redirect URI `https://home.redactplus.io/auth/callback`;
- post-logout redirect URI `https://home.redactplus.io/signed-out`;
- web origin `https://home.redactplus.io`;
- scopes `openid profile email`.

Deliver the client secret through the server's secret file. Never by chat or email.

Also confirm or decide:
1. **The public issuer URL.** Today it is `https://admin.redactplus.io/identity/realms/saferedact`.
   We recommend a customer-facing host such as `id.redactplus.io`.
2. **Self-registration** on the realm, with **required email verification**. Activation already
   refuses unverified addresses.
3. **Whether the realm accepts `prompt=create`.** If it does not, we send a plain login request
   and rely on the login page's Register link (`PORTAL_OIDC_REGISTRATION_PROMPT=`).
4. **A RedactPlus login theme**, and an SMTP sender on a RedactPlus domain for verification
   emails.
5. **An end-session endpoint** that accepts `id_token_hint` and the post-logout URI above.

## 3. Needed for Phase 2: licence status and trial (NOT YET VERIFIED, proposed)

Today the only account API (`POST /v1/api/account/profile`) authenticates with the
device-bound licence token, so a web session cannot use it.

The contract below is implemented on the portal side in
`apps/portal/src/lib/customer-api/contract.ts`, and every response is validated there.

All endpoints:
- require `Authorization: Bearer <access token>`, issued by the realm to `redactplus-portal`,
  with an audience the API checks (proposed: `redactplus-customer-api`);
- identify the customer **only** from the token's `sub` (linked to `Users` the way
  `OidcIdentityLinker` does);
- return JSON errors as `{ "error": "<code>", "message": "<optional>" }`.

### `GET /v1/api/customer/me`

`200`:

```json
{
  "subject": "kc-sub",
  "email": "a@example.com",
  "emailVerified": true,
  "displayName": "A Person",
  "organisation": { "id": "tenant-guid", "name": "Org", "role": "owner|admin|member" },
  "licence": {
    "status": "none|trial|active|expired|suspended",
    "licenceTypeCode": "document|document_media|null",
    "entitlements": ["Document", "Image", "Audio", "Video"],
    "termEndsAt": "2026-11-12T23:59:59Z",
    "isTrial": true
  },
  "devices": { "used": 1, "allowed": 2 }
}
```

`organisation` and `devices` may be `null`.

Errors:
- `401`: token missing, expired or invalid.
- `403 staff_account`: staff identities cannot hold a seat.
- `403 multiple_organisations`: matches the existing activation refusal.

### `POST /v1/api/customer/trial`

Idempotent. The portal sends an `Idempotency-Key` header. Body: `{ "organisationName": "optional" }`.

`201` (or `200` when it already exists):

```json
{ "status": "provisioned|pending|existing", "tenantId": "…", "licenceTypeCode": "document_media", "startsAt": "…", "endsAt": "…" }
```

Errors:
- `403 email_unverified`
- `409 already_member_of_organisation`
- `422 trial_not_eligible` (with a `reason`)
- `429` with `Retry-After`

**The backend owns all trial eligibility and abuse rules:** one trial per verified email and
per device fingerprint, a disposable-domain policy, and so on.

### Control Center changes this implies

- A self-service path that creates a tenant, user, subscription and seat for a new verified
  identity. Today accounts exist only by invitation, and activation denies "not a member of
  any organisation".
- A **7-day** term, or a `Custom` end date chosen by the trial flow. `LicenceTerm` has nothing
  shorter than `OneMonth`.
- A trial plan definition: licence type, device allowance and cloud-credit policy.
- What happens when a trial user is later invited into a paying organisation. Activation
  rejects identities in more than one organisation.

## 4. Decisions needing agreement

| Decision | Options |
|---|---|
| What triggers the trial | at registration (portal calls `/customer/trial` after first verified sign-in), on first visit to `/download`, or on first desktop activation |
| Trial package | `document` or `document_media` |
| Identity hostname | keep `admin.redactplus.io/identity` or add `id.redactplus.io` |
| Gate downloads on licence | today: signed in is enough; later: require `licence.status ∈ {trial, active}` |
| Installer hosting | today the console uses a Google Drive link (`Downloads:WindowsInstallerUrl`), which cannot be gated or fetched reliably; we recommend object storage on a RedactPlus host |
| Rate limits | backend limits on `/customer/trial`; the portal limits `/auth/*` per address |

## 5. What the portal guarantees

- No password is ever received, stored or forwarded. Sign-in happens only on Keycloak pages.
- No desktop credentials, licences, licence tables or entitlements are created or changed.
- Licence state is displayed only as the backend reports it. Nothing from the browser is
  trusted.
- No admin credentials. The portal holds only its own client secret.
- Tokens stay on the server, encrypted at rest. Sessions are host-only cookies on
  `home.redactplus.io`.
- The development identity provider cannot run in production, and production configuration
  refuses non-https issuers.

## 6. Needed for sign-in inside the Download dialog (NOT YET VERIFIED, proposed)

> **Superseded for registration (6 Nov 2026).** New customers no longer choose a password in the
> dialog. Registration collects name, email and an optional organization, posts to the marketing
> site's own `/api/registration`, and the backend emails a Keycloak set-up link. See
> `docs/onboarding/backend-registration-contract.md`. The `register` row below, and the portal's
> `register` credential action, are no longer used by the dialog; remove them when the backend
> adapter is built. Sign-in and password reset below are unchanged.

The marketing site's Download dialog has a full account form: create account (name, email,
password, confirm) and sign in (email, password, forgot password). It posts to the portal, which
owns the session: `POST https://home.redactplus.io/api/auth/credentials/{register|signin|password-reset}`.
The portal then calls a backend adapter, `apps/portal/src/lib/credential-auth/adapter.ts`.

### Verified today: nothing can serve it

Checked read-only on Admin-panel `origin/main` `a5f16f8`:
- The realm export has `registrationAllowed: false`. Customer self-registration is deferred
  (REQUIREMENTS R-1.7), and membership is by invitation (R-1.3).
- Direct-grant (password) login is enabled only on the desktop activation client.
  `POST /v1/api/activation/authorize` licenses a device. It is not a browser sign-in and must
  not be reused for one.
- The console's `/auth/login` is an antiforgery-protected form for the console's own pages.

So the shipped adapter is `unavailableCredentialAdapter`, and the endpoint answers
`503 credential_auth_unavailable`.

The dialog itself keeps submission disabled (`NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH` unset) and
offers the existing Keycloak redirect as a labelled fallback. Note that the fallback cannot
register new customers either, while realm registration is off.

### What the backend needs to provide (proposed)

These are server-to-server calls from the portal only, authenticated as the confidential
`redactplus-portal` client, over TLS. They are never called from a browser, and never through
the Keycloak admin API from the website.

| Endpoint | Body | Success | Failures |
|---|---|---|---|
| `POST /v1/api/customer-auth/register` | `{ name, email, password }` | `202 { status: "verification_required" }`: account created in Keycloak with verify-email required. No session yet. | `409 account_exists`, `422 password_rejected` (Keycloak policy), `429` |
| `POST /v1/api/customer-auth/signin` | `{ email, password }` | `200 { idToken, accessToken, refreshToken, expiresIn }` for the `redactplus-portal` client, plus the verified identity (`sub`, `email`, `email_verified`, `name`) | `401 invalid_credentials` (same for unknown account or wrong password), `403 email_unverified`, `429` with lockout, `423` when locked |
| `POST /v1/api/customer-auth/password-reset` | `{ email }` | `202` always, whether or not the account exists; Keycloak sends the email | `429` |

Requirements on the backend side:
- Use the same Keycloak user the desktop signs in with, so the credentials work in RedactPlus
  Desktop.
- Apply brute-force protection and the realm password policy.
- Send verification and reset emails from Keycloak.
- Never return or log passwords.
- Decide whether registration also creates the trial tenant, user and seat, or whether
  `POST /v1/api/customer/trial` (§3) does.

Keycloak notes for whoever implements this:
- Server-side direct grant (ROPC) for a confidential client is one way to implement sign-in.
  OAuth 2.1 deprecates ROPC, so the backend team should confirm it is acceptable, or provide an
  equivalent token exchange.
- Registration needs the Keycloak admin API on the backend, with its own least-privilege
  client (`manage-users` only), never exposed to the website.

When these exist:
1. Implement a `backend` adapter.
2. Select it in `credentialAdapterFor()`.
3. Build the marketing site with `NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH=enabled`. This also lets
   the marketing CSP connect to the portal origin.

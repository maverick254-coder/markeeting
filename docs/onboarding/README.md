# RedactPlus email onboarding: website integration

Branch `feat/redactplus-email-onboarding`, started 6 November 2026 from
`feat/redactplus-customer-portal` @ `9552266`.

## The journey

1. On `redactplus.io` the visitor clicks **Download**. The shared Download dialog opens on
   **Create your RedactPlus account**.
2. They enter full name, email, an optional organization, and agree to the Terms and Privacy
   Policy. **There is no password field.**
3. The dialog posts to the site's own `POST /api/registration`. The server validates the input,
   applies rate limits and a honeypot, and forwards it to the backend
   ([contract](backend-registration-contract.md)).
4. Only when the backend acknowledges it does the dialog show **Check your email**, with a general
   seven-day trial note, Return to website, and Resend (only if the backend supports it).
5. The backend has Keycloak email a set-up link ([templates](email/README.md)). The customer
   chooses a password on the RedactPlus-themed Keycloak page, which enforces the realm policy.
6. Keycloak redirects to `https://home.redactplus.io/`. The portal requires a session and starts its
   normal OIDC sign-in, which completes on Keycloak's SSO session. The portal has no registration
   form.
7. The same email and password then work in RedactPlus Desktop, which uses the same realm through
   its activation client.

`/set-password` on the website explains steps 5 to 7 and helps with expired or used links. It takes
no token or password. The website password form is designed (development preview
`/prototypes/set-password`) but cannot submit; see
[contract §4](backend-registration-contract.md#4-website-password-form-not-needed-with-the-keycloak-flow).

Existing customers keep the approved boundary: Sign in and Forgot password in the dialog stay
disabled until the portal credential API exists, with the labelled Keycloak redirect as the
fallback (`docs/portal/backend-integration-boundary.md` §6).

## Files

| Area | Files |
|---|---|
| Dialog | `src/components/portal-entry/RegistrationForm.tsx`, `RegistrationSuccess.tsx`, `registration-validation.ts`; `AuthPanel.tsx` (sign-in and reset only) |
| Server | `src/app/api/registration/route.ts`, `src/app/api/registration/resend/route.ts`, `src/lib/onboarding/{contract,adapter,handler}.ts` |
| Password set-up | `src/app/set-password/page.tsx`, `src/lib/onboarding/password-setup.ts`, `src/components/onboarding/PasswordSetupPanel.tsx` (preview only) |
| Copy | `src/content/onboarding.ts` |
| Previews (dev only) | `/prototypes/auth-dialog`, `/prototypes/set-password` |
| Email | `docs/onboarding/email/*`, `scripts/onboarding/*` |
| Tests | `tests/registration-onboarding.test.ts`, `tests/portal-download-entry.test.ts` |

## Production configuration

Registration is a permanent part of the Download dialog; there is no on/off switch. The launch
steps are in `docs/releases/2026-11-redactplus-customer-launch.md`:

1. The backend ships the trusted-address change, Turnstile secret, trial organisation, the
   customer login theme and SMTP ([findings](email-delivery-and-spacemail.md)).
2. Configure the marketing server runtime: `REDACTPLUS_REGISTRATION_API_URL`,
   `REDACTPLUS_REGISTRATION_FORWARDER_TOKEN` (secret) and `TRUST_PROXY_HOPS`.
3. Build the marketing site with `NEXT_PUBLIC_PORTAL_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   (`deployment/redactplus/scripts/build-image.sh` requires the key with the portal URL).

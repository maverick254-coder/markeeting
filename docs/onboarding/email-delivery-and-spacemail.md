# Onboarding email delivery and SpaceMail: findings

Prepared 6 November 2026. Read-only: no SMTP connection was made, no credentials were requested
or handled, and no email was sent.

## Recommendation: Keycloak sends it, the website sends nothing

The set-up email must carry a Keycloak action token. Only Keycloak can mint that token, and it
sends the email itself through `execute-actions-email`. That call already exists in the Control
Center (`IdentityAdministration.cs`, `ExecuteActionsEmailAsync`). So:

- **Delivery:** the Keycloak realm's SMTP settings, pointed at SpaceMail.
- **Content:** the realm's email theme. Use `docs/onboarding/email/keycloak/` for
  `executeActions.ftl` (HTML and text) and the subject.
- **Website:** no mail transport for onboarding. A website mailer would either duplicate the email
  or need a token it must not hold.

The website has a separate, server-only mail path for sales and contact enquiries only
(`src/lib/leads`, `LEAD_DELIVERY_*`). Since 6 November 2026 it can submit through SpaceMail SMTP
(see `docs/operations/enquiry-email.md`). It is unrelated to identity: it never sends set-up or
password email, and the registration code cannot reach it.

## What is configured today (Admin-panel `origin/main` `a5f16f8`)

- `ops/keycloak/saferedact-realm.json` → `smtpServer`: host, port, from, user and password come
  from `IDENTITY_SMTP_*` environment values. `auth: true`, `starttls: true`, and no `ssl` key.
- `scripts/set-smtp.sh` defaults to `smtp.hostinger.com:587` with STARTTLS (`ssl: "false"`), uses
  the mailbox address as both `user` and `from`, and sets `fromDisplayName` to "Redact Plus".
- Email theme `saferedact`: footer contact `admin@saferedact.io`, legal links on
  `admin.redactplus.io`, and a logo loaded from `https://admin.redactplus.io/brand/redact-plus-logo-dark.png`.

## SpaceMail: published client settings

Spaceship's own setup guides give the outgoing server as **`mail.spacemail.com`, port 465,
SSL/TLS**. The username is the full mailbox address and the password is the mailbox password.
None of the guides document STARTTLS on port 587.

- https://www.spaceship.com/knowledgebase/set-up-spacemail-thunderbird/
- https://www.spaceship.com/knowledgebase/setup-spacemail-iphone-apple-mail/

**Not verified for this account:** sending limits, whether SMTP sending is enabled on the plan,
whether `no-reply@redactplus.io` is a real mailbox that can authenticate or only an alias, and
whether SpaceMail allows a `From` that differs from the authenticated mailbox.

## What the backend must change to send through SpaceMail

1. The realm today implies STARTTLS. For SpaceMail's documented settings, set:
   - `host=mail.spacemail.com`
   - `port=465`
   - `ssl=true`
   - `starttls=false`

   Check this against Spaceship before go-live. `set-smtp.sh` hard-codes `ssl: "false"` and
   STARTTLS, so it needs the same change or a SpaceMail mode.
2. Sender identity:
   - `from=no-reply@redactplus.io`
   - `fromDisplayName=RedactPlus`
   - `replyTo=support@redactplus.io`

   If `no-reply@` cannot authenticate, create it as a mailbox, or authenticate as a mailbox that is
   allowed to send as it.
3. **DNS for `redactplus.io`** (Cloudflare; not changed here):
   - SPF that includes SpaceMail's sending hosts;
   - a DKIM key published from the SpaceMail panel;
   - a DMARC policy.

   Without these, set-up emails to government and legal mailboxes will be quarantined.
4. Store the SMTP password only in the server's `.env` / secret store, as `set-smtp.sh` does today.
   Never commit it or send it to a browser.
5. Theme updates:
   - footer contact `support@redactplus.io`;
   - host the PNG logo at a RedactPlus URL. The website build includes
     `public/images/brand/redactplus-email-logo.png`, served at
     `https://redactplus.io/images/brand/redactplus-email-logo.png` once deployed.
6. Test with Keycloak's own "Test connection" button and a staging realm, sending to an internal
   mailbox, before any customer email.

## Safeguards on the website side

- No SMTP credential is held anywhere in this repository. The SpaceMail host and port appear
  only as commented examples in `deployment/redactplus/app.env.example`, for the enquiry mail;
  no code hard-codes them.
- `scripts/onboarding/render-email-preview.mjs` renders templates to files with `example.com` and
  `.invalid` sample values. It has no mail transport and no network access.
- `tests/registration-onboarding.test.ts` checks that the templates hold placeholders only (no
  dates, tokens or credentials), and that the website code holds no SMTP configuration.

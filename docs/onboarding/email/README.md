# Onboarding email templates

"Welcome to RedactPlus — Set Up Your Account". Sent by the backend's identity system (Keycloak
`execute-actions-email`), never by the website.

| File | Use |
|---|---|
| `welcome-set-password.html` | Engine-neutral HTML (Mustache placeholders). The design reference. |
| `welcome-set-password.txt` | Plain-text alternative. Send both as `multipart/alternative`. |
| `keycloak/html/executeActions.ftl` | The same design as a Keycloak FreeMarker template, for `ops/keycloak/themes/saferedact/email/html/` (Admin-panel). |
| `keycloak/text/executeActions.ftl` | The plain-text Keycloak version, for `…/email/text/`. |
| `keycloak/messages_en.additions.properties` | Subject and footer contact changes. |
| `assets/redactplus-logo-on-light.png` | 600×151 logo, displayed at 160 px wide. Also in `public/images/brand/redactplus-email-logo.png`. |

**Sender:** `RedactPlus <no-reply@redactplus.io>`. **Reply-To:** `support@redactplus.io`.

## Placeholders

| Placeholder | Supplied by | Notes |
|---|---|---|
| `{{setupUrl}}` | Keycloak (`${link}`) | The action-token URL. Only the identity system may generate it. Never log it. |
| `{{linkExpiry}}` | Keycloak (`linkExpirationFormatter`) | For example "24 hours" (the Control Center's `LinkLifetime` default). |
| `{{fullName}}` | Backend (Keycloak `firstName` + `lastName`) | HTML-escaped. |
| `{{email}}` | Backend | The registered address. |
| `{{trialStartSentence}}` | Backend, **confirmed wording only** | One sentence on when the trial starts. Empty until decided. |
| `{{#trialConfirmed}}` with `{{trialPackage}}`, `{{trialStartsAt}}`, `{{trialEndsAt}}` | Backend, **confirmed values only** | Each line is omitted when empty. Never type a date into the template. |
| `{{logoUrl}}` | Ops | `https://redactplus.io/images/brand/redactplus-email-logo.png` once deployed. |
| `{{companyName}}`, `{{companyAddress}}` | Legal | The registered entity. The address line is skipped when empty. |
| `{{privacyUrl}}`, `{{termsUrl}}` | Legal | Today `https://admin.redactplus.io/privacy` and `/terms`. |

## Previewing safely

```bash
node scripts/onboarding/render-email-preview.mjs <output-directory>
node scripts/onboarding/render-email-preview.mjs <output-directory> --confirmed-trial
```

The script writes HTML and text files with `example.com` and `.invalid` sample values. It cannot
send email. For a real send test, use Keycloak's "Test connection" on a staging realm with an
internal mailbox.

## Design notes

- Table-based, inline styles, light only, 600 px. The button is "bulletproof", with a VML fallback
  for Outlook.
- Brand: white canvas, ink `#1C1917`, brand orange `#FF735C` with a `#1C1917` label (6.5:1).
  Orange text is `#C2412A` (5.1:1 on white).
- With images blocked it still reads correctly: the logo's alt text is "RedactPlus", and nothing
  else depends on an image.
- No tracking pixels, no remote fonts, no secrets.

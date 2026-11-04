# RedactPlus licensing and pricing audit

Audit date: 4 November 2026. Supersedes the package structure in
`openredakt-pricing-audit.md` and `openredakt-control-center-licensing-audit.md` (Essential /
Advanced / Complete Suite), which described an audio-only package the licensing system does not
sell. The feature evidence in `openredakt-pricing-feature-audit.md` still applies to the
document and audio rows.

All sources were read-only. No licence record, plan, entitlement or authorization rule was changed.

## Sources

| Source | What was read |
| --- | --- |
| `Admin-panel` `origin/main` (`e908e38`) | `Domain/LicenceTypes.cs`, `Domain/LicensePackages.cs`, `Web/appsettings.json` (`LicensePackages:Standard`), `Docs/PRICING.md` §7 |
| `redact` (desktop) `origin/develop` (`49cfff0`) | `Features/Licensing/LicenseEntitlements.cs`, `Contracts/MediaFileFormats.cs`, `Contracts/RedactionEffect.cs`, video editor/export services and tests |
| Production Control Center database (`saferedact_db` on 31.97.42.73) | `SELECT` on `"Plans"` in a `default_transaction_read_only` session |

## Confirmed licence types

| | Document | Document + Media | Enterprise |
| --- | --- | --- | --- |
| A. Internal licence type | Standard package, code `document` | Standard package, code `document_media` | None. The Control Center's negotiated `PackageKind.Custom` |
| B. Customer-facing name | "Document" (Control Center and desktop) | "Document + Media" (Control Center and desktop) | None defined; "Enterprise" is a marketing label for a negotiated package |
| C. Signed entitlements | Document, Image | Document, Image, Audio, Video | Any combination agreed by a vendor |
| D. Seats / devices (production plan) | Uncapped seat model, 2 devices per seat | Capped, max 50 seats, 2 devices per seat | Per agreement |
| E. Multiple users | Yes (organisation seats) | Yes | Yes |
| F. Price (production plan) | USD 1,500 per user per year, 12-month term, active | USD 2,500 per user per year, 12-month term, active | No price; quoted |
| G. Available capabilities | Documents. Image is licensed but "image redaction is not available yet" (`LicensePackageCatalog`) | Documents, audio, video. Image as for Document | As agreed |

A legacy "Document Suite" plan (EUR 3,000, inactive) also exists in production and is not sold.

## Package mapping on the website

| Website slug | Licence type | Price shown | CTA |
| --- | --- | --- | --- |
| `document` | `document` | $1,500 / user / year (≈ $125/month equivalent) | Request a demo |
| `document-media` | `document_media` | $2,500 / user / year (≈ $208.33/month equivalent) | Request a demo |
| `enterprise` | Custom (negotiated) | Contact Sales | Contact Sales |

Former values on old links and enquiries are read as: `essential` → `document`,
`advanced` → `document-media`, `complete-suite` → `document-media` (the only type that includes
audio). The enquiry email records the original choice, so its meaning is kept.

## Media capabilities advertised

- Audio input: WAV, MP3, M4A, AAC, FLAC, OGG, OGA, Opus, WMA, AIFF, ALAC, AMR (`MediaFileFormats`).
- Audio effects: mute, beep, tone, voice disguise (and further masking effects) (`RedactionEffect`).
- Video input: MP4, M4V, MOV, AVI, MKV, WebM (`MediaFileFormats.VideoInputExtensions`).
- Video effects: blur, pixelate, blackout (`RedactionEffect`, editor UI), exported as a redacted
  copy with the soundtrack redacted (`VideoExportComposer`, `VideoExportRunnerTests`).
- The desktop gates files by signed entitlement (`LicensedFileGuard`, `FileContentEntitlements`).

## Enterprise: implemented vs. by agreement

Implemented for every organisation, and stated on the Enterprise card: multiple named-user
seats, owner/admin user and licence management, device view and release, sales-led provisioning.
Negotiated per agreement: capabilities, quantity, term and price (`PackageKind.Custom`).

Not advertised (no implementation or no approval): billing or invoicing, self-service purchase,
automatic renewal, SLAs or dedicated support, specific seat or device limits, cloud credit
allowances (marked provisional in the Control Center), enterprise shared credit pools.

## Open commercial questions

1. Should the public page state the configured device allowance (2 per user)? It is a plan
   setting, not a stated commercial term, so the page says it is confirmed in the quote.
2. Document + Media is capped at 50 seats in production; Document is uncapped. Confirm whether
   that cap is intentional or whether larger deployments should always go through Enterprise.
3. Image is licensed in both types but unavailable. Decide what customers are told once it ships.
4. Cloud credit allowances (1,000 and 2,500 per user per month) are provisional and not shown.

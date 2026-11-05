# Marketing site call-to-action inventory (5 November 2026)

This inventory covers every Request a Demo, Book a Demo, Schedule a Demo, Contact Sales, Get
Started and Download action rendered on redactplus.io. Two places are left out:
- `src/app/prototypes`: development-only design prototypes, never built in production;
- `SoftwareAlternative`: a section component that no page renders.

**Columns.** "Before" is the label and destination on `main`. "After" is this branch.

**Two builds.** Rows marked *(portal)* change only in a build with `NEXT_PUBLIC_PORTAL_URL`
set. Without it, they keep their "Before" label and destination exactly.

"Schedule a Demo" and "Get Started" do not appear anywhere on the site.

| Page | Component | Before | After | Reason |
|---|---|---|---|---|
| Every page with the header | `SiteHeader` (desktop bar, ≥992px) | Request a Demo → `/book-a-demo` | **Download** → shared sign-in dialog *(portal)* | The brief makes Download the global action. Same `Button` primary/sm styling; only the text and action change. |
| Every page with the header | `SiteHeader` (tablet bar, 640–991px) | Request a Demo → `/book-a-demo` | **Download** → shared dialog *(portal)* | As above. |
| Every page with the header | `MobileNav` | Request a Demo → `/book-a-demo` | **Download** → shared dialog *(portal)*; the menu closes first | As above. |
| `/` | `Hero` primary | Request a Demo → `/book-a-demo` | **Download RedactPlus** → shared dialog *(portal)* | Brief. Identical class string, so the white pill, shadow, hover lift and arrow are unchanged. |
| `/` | `Hero` secondary | How It Works → `/how-it-works` | unchanged | Discovery, not conversion. |
| `/features` | `PageHero` primary | Request a Demo → `/book-a-demo` | **View Pricing** → `/pricing` | Someone comparing features is next deciding on a package. The footer still offers a demo. |
| `/features/document-redaction`, `/features/audio-redaction` | `FeaturePage` primary | Request a Demo | **View Pricing** → `/pricing` | As above. |
| `/how-it-works` | `PageHero` primary | Request a Demo | **Explore Features** → `/features` | The workflow page leads into product detail. |
| `/industries` | `PageHero` primary | Request a Demo | **Explore Features** → `/features` | Hub page: product next, sales through the footer. |
| `/industries/[slug]` (11 pages) | `IndustryPage` primary | Request a Demo | **Contact Sales** → `/contact` | Sector buyers (legal, government, health…) usually want a conversation about their obligations. |
| `/why-redactplus` | `PageHero` primary | Request a Demo | **View Pricing** → `/pricing` | Its secondary is already "Explore features". |
| `/pricing` | `PricingCards`: Document | Request a demo → `/book-a-demo?package=document` | **Contact Sales** (same destination and preselection) | There is no checkout; a paid licence is provisioned by sales. |
| `/pricing` | `PricingCards`: Document + Media | Request a demo → `…?package=document-media` | **Contact Sales** (same destination) | As above. |
| `/pricing` | `PricingCards`: Enterprise | Contact Sales → `…?package=enterprise` | unchanged | Already correct. |
| All pages except `/book-a-demo`, `/contact` | `Footer` invitation | Request a Demo → `/book-a-demo` | unchanged | The one consolidated sales path on every page. |
| Blog articles | `ArticleAsideCta` | Discuss your workflow → `/book-a-demo` | unchanged | Contextual sales path in long-form reading. |
| `/contact` | `PageHero` | Go to the enquiry form / Email the team | unchanged | The page's own purpose. |
| Footer link groups | `navigation.ts` | Book a demo, Contact | unchanged | Navigation, not a CTA. Both pages are kept. |

## Result

**With a portal build:**
- Download appears in three places only: the header (desktop and tablet), the mobile menu and
  the homepage hero.
- All three open the same dialog, mounted once (`PortalDialogProvider` in `src/app/layout.tsx`),
  and lead to the same `/auth/start?intent=…&return=/download`.

**On every build:**
- Request a Demo remains once per page, in the footer invitation.
- Page heroes point to product discovery or sales.
- No pricing card offers a download, a trial or a checkout.

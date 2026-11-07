# RedactPlus production rollout checklist

> **Superseded for the launch** by `docs/releases/2026-11-redactplus-customer-launch.md`
> (7 November 2026). Registration is no longer a switch: every production marketing build has the
> Download dialog with Create account and Sign in, and there is no registration-off build. The
> readiness evidence below is kept as the 6 November record.

Covers the customer portal (`home.redactplus.io`), the marketing site's Download entry and trial
registration (`redactplus.io`). Prepared 6 November 2026. **Nothing here has been applied.**

Detailed commands live in:
- `deployment/portal/DEPLOYMENT.md` (portal stages A–J);
- `deployment/redactplus/nginx/REAL-IP-CHANGE.md` (stage M);
- `deployment/redactplus/DEPLOYMENT.md` (marketing releases).

This file orders them into three tracks, each with its own approvals and rollbacks, plus the
controlled end-to-end test.

## 1. Readiness

### Confirmed (checked on 6 November 2026)

| Item | Evidence |
|---|---|
| Real-IP snippet trusts only Cloudflare | Its 22 `set_real_ip_from` ranges equal Cloudflare's live `ips-v4` and `ips-v6` lists exactly (the portal `geo` block too). `real_ip_recursive off`, header `CF-Connecting-IP`. Included only in the `redactplus.io` apex HTTPS block. A throwaway nginx showed that a forged `CF-Connecting-IP` from a non-Cloudflare peer is ignored |
| Marketing vhost unchanged since review | The live file was last modified 2 Nov and matches the repository copy apart from the 7 added lines. No `real_ip` exists anywhere live yet |
| Every nginx stage validates | `nginx -t` on a full copy of the live configuration passes for the bootstrap, holding, **staff preview** and final portal sites, alone and together with the marketing change. Unknown host names still go to `admin.redactplus.io` |
| Staff-preview gate works | Throwaway nginx: a visitor not on the list gets the 503 holding text; a listed address reaches the upstream |
| Keycloak portal client present | The live authorize endpoint renders the sign-in page for `redactplus-portal` with S256 and `redirect_uri=https://home.redactplus.io/welcome`, and rejects a foreign redirect URI |
| Portal production configuration | `deployment/portal/app.env.example`, parsed by the portal's own production rules: environment `production`, client `redactplus-portal`, **client secret null (public, PKCE)**, no `prompt`, issuer `https://admin.redactplus.io/identity/realms/saferedact`, customer API `https://api.saferedact.io/`, Postgres sessions, downloads only from `github.com`. `PORTAL_ENVIRONMENT=development` is refused on this origin |
| Issuer and API agree with the backend | Live discovery `issuer` equals the configured issuer. `GET https://api.saferedact.io/portal/me` answers 401 without a token, both from the internet and from the server host |
| Registration is off by default | A production build with default settings: `/api/registration` and `/resend` answer `503 registration_unavailable`; no Turnstile in the page or CSP; no registration form markup; the Get Started buttons fall back to Contact Sales. `NEXT_PUBLIC_REDACTPLUS_REGISTRATION` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` default to empty in the Dockerfile and `build-image.sh`, and the runtime `REDACTPLUS_REGISTRATION_MODE` defaults to unset |
| Build script can activate registration safely | `build-image.sh` now passes both arguments, refuses `enabled` without a site key, labels the image, and tags it `<sha>-registration`, so it never overwrites the registration-off image of the same commit |
| Capacity | `/` has 11.9 GiB free (94% used). 6.6 GiB of RAM is available. The portal needs about 0.3 GB of image plus a small database |
| Names and ports free | Port 6096; no `redactplus-portal*` container, network, volume, deploy folder, certificate or vhost |
| Installer | The host reaches the GitHub release asset (302). The signed-in download chain was verified locally against the real asset (321,387,989 bytes) |

### Assumptions that only a live step can verify

| Assumption | Verified by |
|---|---|
| The API accepts real portal tokens: `Portal__Authority` equals the issuer, and the `azp` policy is satisfied | Stage H2: the staff home page shows the trial panel, not "Licence details aren't available" |
| The portal container can reach `admin.redactplus.io` (through Cloudflare) and `api.saferedact.io` (the server's own address) | Stage H: health `ready`, then the H2 sign-in |
| After the password is set, Keycloak returns to `/welcome` and the portal signs in without a second password prompt | Controlled test, step 5 |
| `TURNSTILE_SECRET` is set on the API, and the Turnstile widget lists `redactplus.io` and `www.redactplus.io` | R0 (backend), then test step 2 |
| A trial organisation is chosen and its **Trial** package subscription is active | R0, then test step 2 (otherwise "Trials can't be started right now") |
| Keycloak's SMTP sends through SpaceMail with the intended sender and reply-to, and passes SPF, DKIM and DMARC | R0, then test step 4 (the SpaceMail fix branch is unmerged) |
| The backend keeps honouring the `CF-Connecting-IP` the website forwards | Test step 3: the staff Trials page shows the tester's own address |
| Let's Encrypt HTTP-01 succeeds through Cloudflare without an nginx change | Stage B `--dry-run`. The path already returns 404 through Cloudflare today |
| Cloudflare per-host Full (strict) and cache bypass can be configured | Stage D; needs dashboard access |
| The Terms page states the 18+ requirement the backend relies on | R0 (legal content) |

## 2. Before any server change

| # | Step | Approval |
|---|---|---|
| P1 | All integration work is **uncommitted** on `feat/redactplus-email-onboarding`: 87 tracked files changed, 25 untracked files, nothing staged. The branch is 1 commit ahead of `origin/main` (`68c7fa5`, never pushed) and behind it only by PR #10's merge commit. Images are built from commits only (`git archive`), so commit, push and review come first. Screenshot folders stay untracked | **Yours: commit, push, PR** |
| P2 | CI and review on the PR; merge to `main` | Yours |
| P3 | Choose the release SHA (on `main`). Run the full test suites again at that SHA in a clean worktree | — |

## 3. Track 1: server infrastructure

Nothing here exposes the portal; each step needs its own approval.

| Stage | Action | Live effect | Rollback |
|---|---|---|---|
| **M** | Marketing real-IP change: snippet plus one `include`, then `nginx -t` and a graceful reload | Real visitor addresses in the marketing logs and rate limits. **Prerequisite for registration** | Restore `nginx-redactplus.io.bak-<ts>` and reload; the snippet is inert |
| **A** | Portal deploy folder, generated secrets, `/etc/nginx` backup tarball | None | `rm -r /root/deploy/redactplus-portal` |
| **B** | Certificate for `home.redactplus.io`: webroot, `--dry-run` first, no reload hook on issue, then `certbot reconfigure` to add one | None | `certbot delete --cert-name home.redactplus.io` |
| **C** | Holding page: http conf, snippets, holding site, then `nginx -t` and a graceful reload | `home` answers 503 "not open yet" with its own certificate (today: admin's certificate and a 400) | Remove the four files and reload |
| **D** | Cloudflare, for `home.redactplus.io` only: Full (strict) configuration rule and a cache bypass rule | None visible; check for no 526 | Delete both rules |
| **E1** | `docker builder prune -f`, `apt-get clean` (about 0.9 GB) | None | Not needed (caches) |
| **F** | Portal database container, schema, first dump, cron line | New container on an internal network | `docker compose down` (keeps the volume); remove the cron line |

E2, the registry clean-up (about 92 GB), is not part of this rollout. It needs the registry owner.

## 4. Track 2: portal deployment

| Stage | Action | Live effect | Rollback |
|---|---|---|---|
| **G** | Build the portal image from the release SHA **on a build machine, not the server**. Push and record the digest. The push lands on this server's registry disk (about 0.3 GB) | None | Do not deploy it |
| **H** | `.env` pin; `docker compose up -d redactplus-portal`; health on loopback | None (holding page still served) | `docker compose rm -sf redactplus-portal` |
| **H2** | Staff preview: list the staff addresses, install `home.redactplus.io.preview.conf`, then `nginx -t` and reload. Run test steps 5–8 with an **existing** staff account | Staff reach the portal; everyone else sees the holding page | Reinstall the holding site and reload |
| **I** | Public launch: install `home.redactplus.io.conf`, then `nginx -t` and reload. Run the public checks in DEPLOYMENT.md stage I | Portal live | Reinstall the preview or holding site and reload |
| **J** | Marketing release with `NEXT_PUBLIC_PORTAL_URL=https://home.redactplus.io` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: the Download dialog offers Create account and Sign in. Needs track 3's R0–R2 first | Download buttons open the dialog | Redeploy the previous marketing digest (`.env.previous`) |

## 5. Track 3: marketing registration activation

| Stage | Action | Approval |
|---|---|---|
| **R0** | Backend and operations confirm in writing:<br>• `TURNSTILE_SECRET` is set on the API;<br>• the Turnstile widget lists `redactplus.io` and `www.redactplus.io`;<br>• the trial organisation and Trial subscription are active;<br>• realm SMTP goes through SpaceMail;<br>• `CF-Connecting-IP` handling is agreed;<br>• the Terms page states 18+.<br>Stage M must be live | Backend team |
| **R1** | Choose the staff test mailbox and the tester's network (see the controlled test). A platform Owner may set the trial limit window | Backend / you |
| **R2** | Marketing `app.env`: `REDACTPLUS_REGISTRATION_API_URL=https://api.saferedact.io/public/trial-registrations` and `REDACTPLUS_REGISTRATION_FORWARDER_TOKEN` (same as the API's `TRIAL_FORWARDER_TOKEN`). Takes effect with R3's deploy | **Yours** |
| **R3** | Build the marketing image with `NEXT_PUBLIC_PORTAL_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (stage J). Before deploying, add the controlled-window WAF rule below. Deploy | **Yours** |
| **R4** | Run the controlled end-to-end test (all steps) | — |
| **R5** | Remove the WAF rule: registration is public | **Yours** |

**Controlled window (recommended).**
- Before R3, add a temporary Cloudflare WAF custom rule on `redactplus.io`: *URI path starts with
  `/api/registration` AND source IP not in {staff addresses} → Block*.
- During the test the form is visible to everyone, but only staff submissions reach the backend.
  Anyone else sees "Something went wrong and your registration wasn't confirmed": truthful, and
  nothing is created.
- Without dashboard access, deploy R3 at a quiet hour and run R4 immediately.

**Stopping registration in an emergency** (there is no website switch), fastest first:
1. Re-add the Cloudflare WAF rule above: submissions are blocked at the edge; the form says the
   registration wasn't confirmed and nothing is created.
2. Backend: unset the trial organisation, which makes the API answer `unavailable`; the form says
   trials can't be started right now and nothing was created.
3. Redeploy the previous marketing digest (`.env.previous`).

## 6. Controlled end-to-end test (staff mailbox)

**Choose carefully; each choice consumes something permanent:**
- **Mailbox:** a mailbox that can receive mail, has **never** been a Control Center user, and has
  never had a trial, for example a new SpaceMail mailbox or alias such as
  `trial-test@redactplus.io`. Not `admin@` or `support@` if either is already a Control Center
  account: they would get `existing_customer`. Plus-addresses count as distinct addresses at
  non-Gmail domains, but whether SpaceMail delivers them is unconfirmed.
- **Network:** each registration uses 1 of the 3 trials allowed per network, **for ever** unless a
  platform Owner sets a window. Use a staff network whose quota is not needed, and record it.
- **Computer:** the desktop sign-in in step 7 uses 1 of the 3 trial accounts allowed on that
  computer.

**Steps and pass criteria:**

1. **Before.** Record the marketing and portal digests. Have someone watch the logs:
   - `docker compose logs -f redactplus-landing | grep Registration` (reference, outcome and
     adapter only; no personal data);
   - the portal container logs.
2. **Register.** On `https://redactplus.io/pricing`: **Get Started**, then:
   - name "RedactPlus Rollout Test", the test email, organisation "RedactPlus (rollout test)";
   - tick the 18+ consent and complete the security check.

   Pass:
   - the dialog shows **Check your email**;
   - the log line shows `outcome: accepted, adapter: backend`.

   `email_failed`, `unavailable` or any error → stop: R0 is incomplete.
3. **Backend record.** A staff member opens **Trials** in the console. The new trial shows status
   Not started, and the registered address is the **tester's public IP**, not a Cloudflare or
   server address.
4. **Email.** It arrives at the test mailbox within a few minutes:
   - subject "Welcome to Redact Plus: set up your account";
   - sender as R0 agreed, and its reply-to;
   - the link goes to `admin.redactplus.io/identity/...` and states 72 hours;
   - the headers show `spf=pass`, `dkim=pass` and `dmarc=pass`.

   Check that it is not in spam.
5. **Password.** Open the link: confirm the address, then choose a password that meets the policy
   (14+ characters, upper, lower, digit, symbol). Pass:
   - the browser lands on `https://home.redactplus.io/welcome`, then the portal home, **without a
     second password prompt**;
   - the address bar never holds a code or token after landing.
6. **Portal.** Pass:
   - header initials;
   - **Your trial · Not started**, with a start date about 14 days out and an end 7 days later;
   - credits 40 / 40 / 20;
   - **Download RedactPlus Desktop** leads to the GitHub asset (321,387,989 bytes).
7. **Desktop.** Install v0.3.8 on a test computer and sign in with the same email and password.
   Pass: the desktop is licensed, and the portal home now shows **Active** with an end date 7 days
   from now.
8. **Sign-out and session.** Sign out from the account menu, which lands on `/signed-out`. Then
   open `https://home.redactplus.io/download`: it goes to sign-in.
9. **Repeat registration.** Register the same email again. Pass: "already registered … sent the
   secure set-up link again" (the backend resends at most once per 10 minutes).
10. **Existing customer.** Register with a known staff Control Center address. Pass: "already has
    a RedactPlus account" with **Sign in instead**.
11. **Clean up.**
    - Staff: **End now** (or **Block**) the test trial on **Trials**.
    - Optionally the backend team removes the Keycloak test user.
    - Record that the network and computer used one slot each.

**Stop conditions:**
- Any step answering something other than its pass state.
- Any personal data in website logs.
- Any token or code left in a URL.
- The Turnstile test banner ("For testing only") visible: that means the test key was built in.

Roll back track 3 (§5), then investigate.

## 7. Monitoring after each stage

- `nginx -t` passes, and `docker ps` matches the stage's pre-change snapshot except for the
  intended change.
- `curl -s http://127.0.0.1:6095/api/health` and `…:6096/api/health` report `ready`.
- `/` disk usage is still below 95%; registry pushes land on this disk.
- For 24 hours after M and I, watch the nginx error logs for `realip` or 403 spikes from the
  Cloudflare origin check. A spike from the check means the Cloudflare ranges changed:
  regenerate both lists (DEPLOYMENT.md "Refreshing Cloudflare ranges").

# Enquiry email delivery (SpaceMail SMTP)

How the marketing site sends the sales and contact enquiry forms to a RedactPlus mailbox, how to
configure it, and how to test it safely.

This is the website's only mail. Account set-up and password emails are separate: Keycloak sends
them (see `docs/onboarding/email-delivery-and-spacemail.md`), and nothing here changes that.

## How it works

1. The browser posts the form to `POST /api/contact`.
2. The route checks the request before anything is sent, all exactly as before:
   - content type and body size;
   - the schema;
   - the honeypot field;
   - link-stuffing heuristics;
   - the per-client rate limit (5 per 10 minutes, keyed by `TRUST_PROXY_HOPS`).
3. `resolveLeadTransport()` (`src/lib/leads/delivery.ts`) chooses one transport from the server
   environment:

   | Settings present | Transport | Behaviour |
   |---|---|---|
   | `LEAD_DELIVERY_SMTP_*` | `smtp-email`: SMTP submission (SpaceMail) | Sends the email |
   | `LEAD_DELIVERY_ENDPOINT` and `_TOKEN` | `https-email`: an HTTPS email API | Sends the email |
   | none | `none` | Sends nothing and says so |
   | both, or part of one | | Configuration error. The route answers 500 and the form shows an error |

4. The route answers according to what happened:
   - **200, `delivered: true`**: only after the mail server accepted the recipient.
   - **502**: any failure. The form says the enquiry was not sent and gives the support address.
   - **202, `delivered: false`**: no transport is configured.

   No error path ever shows "Enquiry sent".
5. Each attempt logs one line with the reference, the outcome, the transport and, on failure, a
   fixed reason code such as `smtp-auth`. Names, addresses, message text, server replies and
   credentials are never logged.

### The email

| Header | Value |
|---|---|
| From | `RedactPlus Website <no-reply@redactplus.io>`, the authenticated mailbox. Never the visitor |
| Reply-To | The visitor's name and address, so **Reply** in the inbox answers the customer directly |
| To | `LEAD_DELIVERY_TO`; sales enquiries go to `LEAD_DELIVERY_SALES_TO` when that is set |
| Subject | `Contact enquiry — <organisation or name>`, `Sales enquiry — …` or `Sales enquiry (Enterprise) — …` |
| X-RedactPlus-Reference | The reference the route logged, for tracing a message to its request |

The message has a plain-text part and a branded HTML part (`src/lib/leads/notification.ts`). It
contains no images or tracking, and escapes every visitor value. A "sales enquiry" is any enquiry
from the sales form (`/book-a-demo`) or one that names a package.

### Connection security

- `LEAD_DELIVERY_SMTP_SECURITY=tls` means implicit TLS from the first byte (port 465).
  `starttls` means a required STARTTLS upgrade, with no fallback to plaintext.
- Certificates are always verified (`rejectUnauthorized: true`, TLS 1.2 minimum). There is no
  setting to turn this off.
- Nodemailer's logger and debug output are off, so the SMTP conversation (including AUTH) is
  never printed.
- One connection is opened per enquiry and closed afterwards. There is a hard deadline of
  `LEAD_DELIVERY_TIMEOUT_MS` (default 10 s).
- The SMTP code runs only in the Node server. No `LEAD_DELIVERY_*` value is `NEXT_PUBLIC_`, so
  none reaches a browser bundle.

## Configuration

SpaceMail values come from Spaceship's published client settings: outgoing server
`mail.spacemail.com`, port 465, SSL/TLS, full mailbox address as the username. These guides were
checked on 6 November 2026. Re-check them in the SpaceMail panel before go-live.

- https://www.spaceship.com/knowledgebase/set-up-spacemail-thunderbird/
- https://www.spaceship.com/knowledgebase/set-up-spacemail-outlook-imap-pop3/

Spaceship does not document port 587 or STARTTLS for SpaceMail.

| Variable | Production value | Notes |
|---|---|---|
| `LEAD_DELIVERY_SMTP_HOST` | `mail.spacemail.com` | Bare host name |
| `LEAD_DELIVERY_SMTP_PORT` | `465` | |
| `LEAD_DELIVERY_SMTP_SECURITY` | `tls` | `tls` or `starttls` only |
| `LEAD_DELIVERY_SMTP_USER` | `no-reply@redactplus.io` | The mailbox that signs in |
| `LEAD_DELIVERY_SMTP_PASSWORD` | *secret* | That mailbox's password. Only in `app.env` |
| `LEAD_DELIVERY_FROM` | `no-reply@redactplus.io` | Keep it equal to the SMTP user, unless SpaceMail lets that mailbox send as another address |
| `LEAD_DELIVERY_FROM_NAME` | `RedactPlus Website` | Optional |
| `LEAD_DELIVERY_TO` | `support@redactplus.io` | Receives contact enquiries, and sales enquiries unless the next one is set |
| `LEAD_DELIVERY_SALES_TO` | *(unset)* | Optional separate sales inbox |
| `LEAD_DELIVERY_TIMEOUT_MS` | `10000` | Optional, 500–15000 |

**Mailbox choice.**
- Sales and contact both go to `support@redactplus.io`, the address the site already publishes.
- `admin@redactplus.io` is not recommended for customer mail. Set `LEAD_DELIVERY_SALES_TO` only if
  a separate sales inbox is wanted.
- Sending from `no-reply@` keeps staff replies away from an unread inbox: Reply-To points at the
  customer.

## Deploying the settings (redactplus.io server)

The runtime file is `/root/deploy/redactplus-landing/app.env`: root-owned, mode 600, never
committed (see `deployment/redactplus/app.env.example`). A change needs a container restart, not a
new image.

1. **Back up the file first.**

   ```sh
   cd /root/deploy/redactplus-landing
   install -m 600 app.env "app.env.bak.$(date -u +%Y%m%dT%H%M%SZ)"
   ```

2. **Add the non-secret values** with an editor: every row of the table except the password.

3. **Add the password without it reaching shell history or the terminal.**

   ```sh
   read -rs -p "SpaceMail password for no-reply@redactplus.io: " SMTP_PASSWORD; echo
   printf 'LEAD_DELIVERY_SMTP_PASSWORD=%s\n' "$SMTP_PASSWORD" >> app.env
   unset SMTP_PASSWORD
   chmod 600 app.env
   ```

   Docker Compose `env_file` takes the rest of the line literally. If the password contains `#`,
   or leading or trailing spaces, quote it in single quotes.

4. **Check outbound SMTPS from the host.** Some hosts block outbound 465.

   ```sh
   openssl s_client -connect mail.spacemail.com:465 -servername mail.spacemail.com -brief </dev/null
   ```

   Expect `Verification: OK` and an SMTP `220` greeting.

5. **Apply and check.**

   ```sh
   docker compose up -d redactplus-landing
   docker compose ps                         # healthy
   curl -fsS http://127.0.0.1:6095/api/health
   ```

The SMTP settings are read on the first enquiry, not at start-up. A mistake shows as a 500 on the
first submission, never as a false success. Run the live test below straight after deploying.

**Rate limiting behind Cloudflare. Fix before go-live.** `redactplus.io` is proxied by
Cloudflare, and the host nginx has no real-IP configuration. On 6 November 2026 the marketing
access log showed only Cloudflare edge addresses as clients. So the per-client enquiry limit is
shared by every visitor routed through the same edge, and real visitors can get 429s. The fix
needs its own approval, because it changes the live `redactplus.io` virtual host:
The change is prepared in `deployment/redactplus/nginx/REAL-IP-CHANGE.md`: one shared snippet
(`deployment/shared/nginx/cloudflare-real-ip.conf`) and one `include` line in the apex HTTPS
block, the only block that proxies to the application.

The site's proxy headers already overwrite `X-Forwarded-For` with `$remote_addr`, so
`TRUST_PROXY_HOPS=1` stays correct.

**DNS.** Sending through SpaceMail's own servers needs SPF and DKIM for `redactplus.io` in
Cloudflare, plus a DMARC record. Confirm them before go-live: the live test reads the
`Authentication-Results` header to show they pass.

## Local test (sends nothing)

The automated tests, `tests/lead-delivery-smtp.test.ts` (`npm run test:content`), replace the SMTP
client with a recording double. They check:
- TLS options;
- headers and routing;
- escaping;
- every failure path;
- the route's 502 answer;
- that logs carry no personal data or credentials.

To run the real SMTP conversation end to end, without any mail leaving the machine:

1. Start the capture server. It listens on 127.0.0.1:2465 with implicit TLS, uses a throwaway
   `localhost` certificate (needs `openssl` on PATH) and writes each message to `.smtp-capture/`,
   which git ignores.

   ```sh
   npm run leads:smtp-capture
   ```

2. Start the site in a second terminal, trusting that certificate the normal way. Verification
   stays on. `.env.local` works too; keep these test values out of every committed file.

   ```sh
   NODE_EXTRA_CA_CERTS=.smtp-capture/tls/cert.pem \
   LEAD_DELIVERY_SMTP_HOST=localhost LEAD_DELIVERY_SMTP_PORT=2465 LEAD_DELIVERY_SMTP_SECURITY=tls \
   LEAD_DELIVERY_SMTP_USER=no-reply@redactplus.test LEAD_DELIVERY_SMTP_PASSWORD=local-test-only \
   LEAD_DELIVERY_FROM=no-reply@redactplus.test LEAD_DELIVERY_TO=support@redactplus.test \
   npm run dev
   ```

3. Send the form at `/contact` or `/book-a-demo`. The page should say "Enquiry sent".
   `.smtp-capture/001.eml` holds the message: open it in a mail client to see the HTML part.
4. Stop the capture server and send again. The page should say the enquiry could not be sent, and
   the server log should show `delivery-failed` with reason `smtp-connection`.

## Controlled live test (after the production credentials are set)

Use staff addresses only, and send one message per step.

1. **Contact enquiry.** From the server, so the test needs no browser:

   ```sh
   curl -sS -X POST http://127.0.0.1:6095/api/contact \
     -H 'content-type: application/json' \
     -d '{"kind":"contact","name":"RedactPlus Live Test","email":"admin@redactplus.io","organization":"RedactPlus (live test)","fileType":"Not sure","message":"Live delivery test of the website enquiry form. No action needed."}'
   ```

   Expect `200` with `"delivered":true` and a `referenceId`.
2. **Check the logs.** `docker compose logs --since 5m redactplus-landing | grep '<referenceId>'`
   should show `outcome: 'delivered', transport: 'smtp-email'`, and nothing else about the
   message.
3. **Check the message in `support@redactplus.io`.**
   - From is `RedactPlus Website <no-reply@redactplus.io>`.
   - Reply-To is `admin@redactplus.io`.
   - `X-RedactPlus-Reference` matches the reference from step 1.
   - Both parts render.
   - Not in spam.
   - `Authentication-Results` shows `spf=pass`, `dkim=pass` and `dmarc=pass`.
4. **Reply from support@.** The reply should arrive at `admin@redactplus.io`, the "customer".
5. **Sales enquiry.** Repeat step 1 with `"kind":"demo","packageInterest":"enterprise"`. Expect the
   subject `Sales enquiry (Enterprise) — …`, sent to `LEAD_DELIVERY_SALES_TO` if that is set.
6. **The real form.** Send once through `https://redactplus.io/contact` in a browser and confirm
   "Enquiry sent".

The rate limit allows 5 enquiries per client per 10 minutes. The server-side `curl` steps share one
client key.

If anything fails, the log line's `reason` says where:

| Reason | Meaning | Check |
|---|---|---|
| `smtp-auth` | Sign-in refused | Mailbox, password, SMTP access enabled on the plan |
| `smtp-connection` / `smtp-timeout` | Server not reachable | Outbound 465 from the host and container, DNS |
| `smtp-tls` | Certificate did not verify | Host name exactly `mail.spacemail.com`, system clock |
| `smtp-envelope` / `smtp-5xx` | Sender or message refused | `LEAD_DELIVERY_FROM` must be allowed for the mailbox |
| `smtp-recipient` | Recipient not accepted | `LEAD_DELIVERY_TO` / `_SALES_TO` spelling |

## Rollback

Delivery is configuration only.
- Comment out the `LEAD_DELIVERY_*` lines, or restore the `app.env.bak.*` copy.
- Then run `docker compose up -d redactplus-landing`.

The forms go back to "Enquiry not delivered" with the support address. No image change is needed.

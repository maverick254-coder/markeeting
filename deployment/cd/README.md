# RedactPlus automatic deployment

After every push to `main` whose CI passed, the marketing site (`redactplus.io`) and the customer
portal (`home.redactplus.io`) can be deployed automatically. **It is off until an administrator
switches it on**, one component at a time, using the rollout below.

| Piece | File |
|---|---|
| Final CI job, the only caller | `.github/workflows/ci.yml`, job `deploy / production` |
| Deployment workflow (`workflow_call` only) | `.github/workflows/deploy-production.yml` |
| Which images a commit needs | `scripts/release/changed-components.mjs` |
| Registry push and server call | `.github/scripts/publish-image.sh`, `.github/scripts/remote-deploy.sh` |
| Server-side forced command | `deployment/cd/redactplus-deploy`, installed as `/usr/local/sbin/redactplus-deploy` |
| Tests | `tests/release/*.test.mjs`, `tests/release-pipeline.test.mjs` (part of `npm run test:static`) |

## How a deployment runs

```
push to main ──► CI: marketing / verify, portal / verify, images / build,
                     security / secrets, security / dependencies
                       │ all five succeeded (any failure or skip: no deployment)
                       ▼
                 deploy / plan      (environment "production", main only)
                   1. push to refs/heads/main?  CD_ENABLED == "true"?  still the head of main?
                   2. ssh "status marketing|portal"  → commit, digest and build flags in production
                   3. changed-components.mjs: did this commit change anything that goes into each image?
                   4. CD_COMPONENTS: is automation switched on for that component?
                       │
          ┌────────────┴─────────────┐
   deploy / marketing          deploy / portal          (each: concurrency group, never cancelled)
   build-image.sh (exact SHA,  docker build (exact SHA)
   current production flags)   no dev tooling in /app
   loopback smoke test
   push → digest               push → digest
   ssh "deploy marketing <tag> <digest> <run>"   ssh "deploy portal <sha> <digest> <run>"
   public check                verify portal access is still staff-preview
          └────────────┬─────────────┘
                 deploy / notify    job summary, optional webhook; fails if a deployment failed
```

### The forum image: published, never deployed

With `forum` in `CD_COMPONENTS`, the job `deploy / forum image (publish only)` keeps
`registry.safaridesk.io/safari/redactplus-forum` up to date. It never contacts the server, and
the forced command does not know the forum: installing and upgrading the forum stays a reviewed,
manual step (`deployment/forum/RUNBOOK.md`).

When `CD_COMPONENTS` names only `forum`, the plan skips the `status` call as well, so publishing the
forum image needs only `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`: no deploy key, pinned host key
or `DEPLOY_HOST`. Adding `marketing` or `portal` brings the server call (and those secrets) back.

- The image is tagged with the **forum revision**: the last commit that changed one of its inputs
  (`FORUM_INPUTS` in `changed-components.mjs`, which mirrors `deployment/forum/Dockerfile.dockerignore`;
  a test enforces that). Docs, tests and portal changes do not move it.
- If that tag is already in the registry, nothing is built or pushed. Otherwise the job builds it
  from the exact commit (whose forum inputs equal the revision's), checks the revision label and
  that no bridge tests or local settings ship, pushes it, and writes `RELEASE_SHA` and
  `RELEASE_DIGEST` for the forum's `.env` into the job summary.
- CI's `images / build` has already built the same Dockerfile for this commit and run the bridge
  integration test against it, with a restart, before this job can start.
- Forum host files (`compose.yaml`, the `*.env.example` files, `backup.sh`, `restore.sh`) are
  server configuration: a change is reported, never applied.

On the server, `redactplus-deploy deploy …`:
1. validates every argument against a strict pattern; refuses anything else;
2. refuses a run number that is not newer than the last deployed run (an older run can never
   replace a newer one, whatever order the runs finish in);
3. pulls `repo:tag@digest` and checks the image's `org.opencontainers.image.revision` label is
   that commit;
4. keeps `.env` as `.env.previous`, writes the new pin and recreates **only that one service**
   (`docker compose up -d --no-deps`);
5. waits for the container to be healthy, then smoke-tests:
   - `/api/health` is `ready` and reports exactly this commit;
   - marketing: `/`, `/pricing`, `/contact` return 200;
   - portal: authentication configured, session store `postgres`, and an unknown session
     redirects to sign-in (proves the database is reachable);
6. on any failure, restores `.env.previous`, recreates the service, waits for it to be healthy
   again, and reports `result=failed rollback=healthy|unhealthy`;
7. records the attempt in `deploy-history.jsonl` and `releases.log` (mode 600, beside the
   component's `.env`) and reports, without changing anything:
   - portal: `portal_access` (staff-preview / holding / public, read from the nginx site).

For marketing, step 5 also requires registration to be configured: an invalid request to
`/api/registration/resend`, which the route rejects before any backend is called, must answer 400
(503 means the registration service is not configured, and the release is rolled back).

The workflow fails if the reported portal access is not `PORTAL_EXPECTED_ACCESS`
(default `staff-preview`).

### When nothing is deployed

| Situation | Result |
|---|---|
| Any CI check failed or was skipped | `deploy / production` is skipped by `needs:` |
| Pull request, merge-queue or manual run | Skipped by the job's `if:`; and the production environment admits `main` only |
| `CD_ENABLED` is not `true` | Plan reports "switched off"; nothing is built or pushed |
| Component not in `CD_COMPONENTS` | That component is skipped |
| Commit is no longer the head of main | Skipped; the newer commit's own run deploys it |
| No image input changed since the deployed commit (docs, tests, workflows, other app) | Skipped, with the reason in the summary |
| Same tag and digest already deployed | Server answers `skipped` (exit 3) |
| Server configuration changed (`compose.yaml`, nginx, `app.env.example`, this forced command…) | Warning in the summary: **never applied automatically**, needs a reviewed manual change |

Change detection compares the commit with the one production actually runs (from `status`), so
a skipped commit's changes are picked up by the next one. If the deployed commit is unknown, not
an ancestor of the head, or nothing is deployed yet, the component is deployed. The marketing
input list mirrors the `.dockerignore` allowlist (a test enforces that). Marketing is also rebuilt
when the running image was built without the Download dialog (no
`io.safaridesk.redactplus.portal-url` label).

**Every marketing release has Create account and Sign in.** The workflow always builds with
`NEXT_PUBLIC_PORTAL_URL=https://home.redactplus.io` and the `TURNSTILE_SITE_KEY` variable
(`build-image.sh` refuses the build without the key). There is no registration switch. On the
server, `deploy` additionally requires the registration route to be configured (a malformed
request to `/api/registration/resend` must answer 400, not 503); otherwise the release is rolled
back. `rollback` does not require it, so an older release can always be restored.

## Security review

| Risk | Control |
|---|---|
| An unmerged PR or failed commit deploys | Deployment is a job of CI's own run with `needs:` on all five checks and `if: push && refs/heads/main && this repository`. No `workflow_run`, `pull_request_target` or dispatch trigger. The guard test fails if any appears |
| A PR edits the workflow to reach the secrets | Every job that references a secret runs in environment `production`, whose deployment-branch policy is `main` only. A PR run is on `refs/pull/…` and receives no environment secrets. CI passes exactly the five deployment secrets by name (a called workflow receives no other secret, environment secrets included; `secrets: inherit` is forbidden by test) |
| A stale run overwrites a newer release | CI on `main` runs one at a time per ref (`cancel-in-progress: false`); the plan deploys only the current head; per-component concurrency groups; the server refuses any run number ≤ the last deployed |
| Wrong or tampered image | Built from `${{ github.sha }}` on the runner, pushed, then pinned and pulled by `sha256` digest; the server checks the revision label against the commit |
| Deploy key is stolen | It can run only `/usr/local/sbin/redactplus-deploy` (`restrict,command=…`): no shell, PTY, forwarding or file access. The command takes only `status`, `deploy` and `rollback` for the two components, with fixed paths and `PATH`, and can only re-pin an image that is in the registry and labelled with a matching commit. The worst case is deploying an older legitimate build, which the run-number check limits and the history records. Revoke by deleting its `authorized_keys` line |
| Host spoofing | `StrictHostKeyChecking=yes` against the pinned `DEPLOY_SSH_KNOWN_HOSTS` |
| Secrets in logs | Registry password via `--password-stdin`; key and known_hosts written with `umask 077` to `$RUNNER_TEMP` and deleted on exit; no `set -x`; the forced command never reads or prints `app.env`, `db.env`, SMTP, Keycloak or database credentials (enforced by tests). GitHub masks environment secrets in logs |
| Portal opened to the public by accident; a release that cannot register customers | The pipeline cannot change nginx or the staff allowlist, and fails if the portal's reported access is not the expected one. A marketing release whose registration route is not configured is rolled back by the server |
| Changes beyond the image | No Keycloak, licensing, Cloudflare, DNS, nginx, firewall or database-schema change is possible from the workflow or the forced command. Server-config changes are only reported |
| Supply chain | Actions pinned by commit SHA (`actions/checkout`, `actions/setup-node` v6.0.0); `npm ci` from lockfiles; the CI security checks run before deployment |
| Registry or disk exhaustion | See retention below; nothing is deleted automatically |

Residual risks, accepted for now:
- The key logs in as `root` (the existing deployments are root-owned under `/root/deploy`). The
  forced command is what limits it. A dedicated non-root user with a narrow `sudo` rule for this
  one command is a later hardening step.
- The registry push credential can push any tag in the registry. Use a dedicated account that
  only this pipeline uses, so it can be rotated or revoked on its own.
- The forced command runs as root on a host that also serves other projects. Its code is short,
  reviewed and tested; changes to it are flagged as server configuration and must be
  reinstalled by hand.

## GitHub settings (administrator)

1. **Settings → Environments → New environment `production`:**
   - Deployment branches and tags: **Selected branches → `main`**. Do this **before** merging:
     a missing environment is created automatically by the first run *without* any branch rule.
   - Required reviewers: none for fully automatic deployment, or one named approver if every
     production deployment should wait for a click. (With reviewers, every push to main waits at
     `deploy / plan`.)
   - Environment **secrets**:

     | Secret | Value |
     |---|---|
     | `REGISTRY_USERNAME`, `REGISTRY_PASSWORD` | Dedicated push account for `registry.safaridesk.io` |
     | `DEPLOY_SSH_KEY` | Private half of the new ed25519 key (below), used for nothing else |
     | `DEPLOY_SSH_KNOWN_HOSTS` | The server's host key line(s), captured from the server itself |
     | `DEPLOY_NOTIFY_WEBHOOK` | Optional: Slack-compatible incoming webhook (`{"text": …}`) |

   - Environment **variables**:

     | Variable | Value |
     |---|---|
     | `CD_ENABLED` | Leave unset (off). `true` switches automation on |
     | `CD_COMPONENTS` | `portal` first; later `marketing,portal`. Add `forum` to publish the forum image (never deployed) |
     | `DEPLOY_HOST` | The production server's address |
     | `PORTAL_EXPECTED_ACCESS` | Unset (= `staff-preview`). Change only after public access is separately approved |
     | `TURNSTILE_SITE_KEY` | Public site key of the registration security check (required for marketing builds) |

2. **Settings → Rules → Rulesets** for `main` (as in `docs/ci/README.md`): require the five CI
   checks and a reviewed pull request, and block force pushes. Branch protection is what makes
   "a push to main" mean "a reviewed, checked merge".
3. **Settings → Actions → General:** workflow permissions "Read repository contents".

## Server installation (separately authorized server change)

Not done by this pull request. Run as root on the production server, after review:

```bash
install -m 750 -o root -g root redactplus-deploy /usr/local/sbin/redactplus-deploy   # from deployment/cd/
ssh-keygen -t ed25519 -N '' -C github-actions-redactplus-cd -f /root/redactplus-cd-key  # or generate offline
```

Add one line to `/root/.ssh/authorized_keys`, then move the private key into the GitHub secret
and delete it from the server:

```
restrict,command="/usr/local/sbin/redactplus-deploy" ssh-ed25519 AAAA… github-actions-redactplus-cd
```

```bash
ssh-keyscan -t ed25519 localhost 2>/dev/null | sed 's/^localhost/<DEPLOY_HOST>/'   # DEPLOY_SSH_KNOWN_HOSTS
shred -u /root/redactplus-cd-key && rm /root/redactplus-cd-key.pub
```

Check from a workstation with the new key (read-only):

```bash
ssh -i redactplus-cd-key root@<DEPLOY_HOST> "status portal"    # release_sha=…, portal_access=staff-preview
ssh -i redactplus-cd-key root@<DEPLOY_HOST> "uname -a"         # result=refused
```

The first automatic deployment of each component starts from `last_run=0`; the existing
`.env`, `.env.previous` and `releases.log` are kept and extended.

## Rollout

Each stage is its own approval. Do not skip ahead.

| Stage | Action | Proves |
|---|---|---|
| 0 | Create the `production` environment (main only), **no** `CD_ENABLED`. Merge this PR | A push to main runs `deploy / plan`, which reports "switched off". A PR run shows `deploy / production` as skipped |
| 1 | Install the forced command and key on the server; add the secrets and `DEPLOY_HOST` | `status` works and anything else is refused |
| 2 | `CD_ENABLED=true`, `CD_COMPONENTS=portal`. Merge a small, reviewed portal change | Exact commit deployed to the **staff preview**; `/api/health` commitSha matches; `portal_access=staff-preview`; history line on the server and the GitHub deployment record |
| 2a | Merge a docs-only change | Plan: "no image input changed"; nothing pushed or restarted |
| 2b | Merge two portal changes in quick succession | The first run is skipped ("main has moved on") or queued; only the newest is deployed; `last_run` only rises |
| 2c | A PR whose CI fails (or the history of one) | `deploy / production` skipped |
| 2d | Rollback drill: on the server, `SSH_ORIGINAL_COMMAND="rollback portal 0" /usr/local/sbin/redactplus-deploy`, then let the next merge redeploy | Previous digest restored and healthy; recorded in history. (The automatic rollback on failed health checks is covered by the tests; do not break production to show it) |
| 2e | After each: staff sign-in works, a non-staff address still gets 503 (until the portal's public launch) | Access unchanged |
| 3 | After a week of clean portal runs, and once production registration is configured (launch document): `CD_COMPONENTS=marketing,portal` | The next marketing change rebuilds with the Download dialog; `/`, `/pricing`, `/contact` 200; the registration route answers 400 to the server's malformed probe |

To stop automation at any time: set `CD_ENABLED` to anything other than `true` (takes effect
from the next run), or remove a component from `CD_COMPONENTS`. To cut the server off entirely:
delete the key's line from `authorized_keys`.

## Rollback

- **Automatic:** a deployment that fails its health or smoke checks restores the previous digest
  by itself; the run fails and the notification says `rollback=healthy` (or `unhealthy`: treat
  as an incident and use the manual steps).
- **On request, as root on the server:**
  ```bash
  SSH_ORIGINAL_COMMAND="rollback portal 0" /usr/local/sbin/redactplus-deploy      # or marketing
  ```
  It restores `.env.previous`, checks health and the smoke tests, and puts the current release
  back if the previous one is not healthy. Then **set `CD_ENABLED` off (or drop the component
  from `CD_COMPONENTS`)** until the fix is merged: otherwise the next qualifying merge redeploys.
- **Manual:** `deployment/redactplus/ROLLBACK.md` section 1 (and the portal equivalent in
  `deployment/portal/DEPLOYMENT.md`) still apply: copy `.env.previous` over `.env`, or any older
  `RELEASE_SHA`/`RELEASE_DIGEST` from `releases.log`, then `docker compose up -d <service>`.
- Older releases stay pullable by digest as long as the registry keeps them (below).

## Deployment history

- **GitHub:** each run's job summary (what was deployed before, the plan, the server's answer),
  plus the environment's deployment list under *Environments → production*.
- **Server:** `/root/deploy/<component dir>/deploy-history.jsonl` (one JSON object per attempt:
  time, component, action, outcome, commit, digest, run, previous) and `releases.log`.
- **Team:** the optional webhook posts one line per attempted deployment.

## Registry retention (strategy only; nothing is automated)

Each marketing or portal deployment pushes one image (~150–350 MB of new layers) to
`registry.safaridesk.io`, which shares a disk with production (about 95% used, ~11 GiB free when
last checked). Automatic deployment makes pushes more frequent, so retention must be agreed and
run by an operator. Proposal, for separate review:
1. **Keep:** the image each component currently runs, its `.env.previous`, and the last 10
   deployed digests per repository from `deploy-history.jsonl` / `releases.log`, plus anything
   younger than 30 days; never touch other projects' repositories.
2. **Delete** older RedactPlus manifests **by digest** through the registry API (registry
   `delete` enabled), after a dry-run list has been reviewed.
3. Run `registry garbage-collect --dry-run`, review, then garbage-collect in a maintenance
   window (the registry should be read-only or stopped while it runs).
4. On the server, remove only RedactPlus images that are neither running nor in `.env.previous`,
   by explicit reference: never `docker system prune` or `image prune -a`.
5. Until that exists: check free space before switching on each stage, and switch `CD_ENABLED`
   off if the disk passes 97%.

## Testing evidence (local, this pull request)

- `tests/release/redactplus-deploy.test.mjs` runs the real forced command against stand-in
  `docker`/`curl` in a temporary root: status; deploy with history; older and equal run numbers
  refused; unhealthy release rolled back; wrong commit served rolled back; revision-label mismatch
  refused before any change; 13 malformed or injected requests refused (including any
  `-registration` tag); a marketing release without configured registration rolled back; a
  rollback that does not require registration; rollback action; no forbidden commands.
- `tests/release/changed-components.test.mjs`: per-image rules, `.dockerignore` mirror, server
  config reporting, decisions, and a temporary Git history (docs-only, other-app, shared
  lockfile, non-ancestor and unknown deployed commits).
- `tests/release/deploy-workflow.test.mjs` and `tests/release-pipeline.test.mjs`: triggers,
  gating, environment scoping of every secret, action pins, concurrency, run numbers, verified
  defaults, no credential logging and no Keycloak, Cloudflare, nginx or registry-cleanup
  commands.
- The plan's decision step, run with stubbed server answers: identical commit → nothing; flag
  change → marketing only; real history (production marketing `7c1ff6b`, portal `e5e7954`, head
  `bce8615`) → both; `CD_COMPONENTS=portal` → portal only; a portal URL other than
  `https://home.redactplus.io` refused.

Not provable before stage 2: SSH from a GitHub runner, registry push from a runner, and the
Linux timings of the two image builds.

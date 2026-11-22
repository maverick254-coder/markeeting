# RedactPlus automatic deployment

After every push to `main` whose CI passed, the **marketing site (`redactplus.io`)** can be
deployed automatically. **It is off until an administrator switches it on** (rollout below).

Only marketing is ever deployed automatically:
- **Portal** (`home.redactplus.io`): deployed by hand (`deployment/portal/DEPLOYMENT.md`) until it
  has a signed-in smoke check that works without a long-lived session cookie. The workflow has no
  portal deployment job and the server program does not know the portal; `portal` in
  `CD_COMPONENTS` is ignored with a warning. Its image can still be *published* (`portal-publish`).
- **Forum**: deployed by hand (`deployment/forum/RUNBOOK.md`: database schema upgrades). Its image
  can be *published* (`forum`), never deployed.

| Piece | File |
|---|---|
| Final CI job, the only caller | `.github/workflows/ci.yml`, job `deploy / production` |
| Deployment workflow (`workflow_call` only) | `.github/workflows/deploy-production.yml` |
| Which images a commit needs | `scripts/release/changed-components.mjs` |
| Registry push and server call | `.github/scripts/publish-image.sh`, `.github/scripts/remote-deploy.sh` |
| SSH forced command of the deploy user | `deployment/cd/redactplus-deploy-ssh` → `/usr/local/sbin/redactplus-deploy-ssh` |
| The one program it may run as root | `deployment/cd/redactplus-deploy` → `/usr/local/sbin/redactplus-deploy` |
| The one sudo rule | `deployment/cd/sudoers-redactplus-cd` → `/etc/sudoers.d/redactplus-cd` |
| sshd limits for the deploy user | `deployment/cd/sshd-redactplus-cd.conf` → `/etc/ssh/sshd_config.d/90-redactplus-cd.conf` |
| Tests | `tests/release/*.test.mjs`, `tests/release-pipeline.test.mjs` (part of `npm run test:static`) |

## How a deployment runs

```
push to main ──► CI: marketing / verify, portal / verify, images / build,
                     security / secrets, security / dependencies
                       │ all five succeeded (any failure or skip: no deployment)
                       ▼
                 deploy / plan      (environment "production", main only; waits for the
                                     required reviewer's click if one is configured)
                   1. push to refs/heads/main?  CD_ENABLED == "true"?  still the head of main?
                   2. ssh redactplus-cd@host "status marketing"  → commit, digest, build flags
                   3. changed-components.mjs: did this commit change anything in the image?
                   4. CD_COMPONENTS names "marketing"?
                       │
                 deploy / marketing   (concurrency group, never cancelled)
                   build-image.sh (exact SHA, production flags), loopback smoke test,
                   push → digest,
                   ssh redactplus-cd@host "deploy marketing <sha> <digest> <run>"
                   (the server also runs the public check and reports it; see step 10)
                       │
                 deploy / notify      job summary, optional webhook; fails if a deployment failed
```

On the server, the deploy key's login is the unprivileged user **`redactplus-cd`**:

```
sshd  ── key line: restrict,command="/usr/local/sbin/redactplus-deploy-ssh"
      ── Match User redactplus-cd: ForceCommand (same), PermitTTY no, no forwarding, key only
  └─► redactplus-deploy-ssh  (root-owned, 3 lines, interprets nothing)
        exec sudo -n -- /usr/local/sbin/redactplus-deploy "$SSH_ORIGINAL_COMMAND"
  └─► sudo: one rule, NOPASSWD, that one program, and the argument must match
        ^(status marketing|deploy marketing <40-hex> sha256:<64-hex> <1-9 digits>)$
  └─► redactplus-deploy  (root, fixed PATH and paths) validates the request again, then acts
```

`redactplus-deploy "deploy marketing <commit> <digest> <run>"`:
1. accepts exactly one argument of lowercase letters, digits, `:` and single spaces; requires
   `marketing`, a 40-hex commit, `sha256:` + 64 hex and a run number; refuses everything else;
2. refuses to run if `.env` holds anything but `RELEASE_SHA`/`RELEASE_DIGEST` (a rewrite can then
   never drop a setting);
3. takes the component lock (`flock` on `.deploy.lock`; a second request waits up to 10 minutes);
4. refuses a run number that is not newer than the last deployed run (an older run can never
   replace a newer one, whatever order the runs finish in);
5. pulls `repo:commit@digest`: this fails, before anything changes, unless the registry holds
   exactly that image; then checks the image's `org.opencontainers.image.revision` is the commit;
6. copies `.env` to `.env.previous`, writes the new pin, runs `docker compose config --quiet`
   and recreates **only** `redactplus-landing` (`docker compose up -d --no-deps`);
7. waits for the container to be healthy, then smoke-tests: `/api/health` is `ready` and reports
   exactly this commit; `/`, `/pricing`, `/contact` return 200; a malformed request to
   `/api/registration/resend` answers 400 (503 means registration is not configured);
8. on any failure, restores `.env.previous`, recreates the service, waits for it to be healthy
   and reports `result=failed rollback=healthy|unhealthy`;
9. records the attempt in `deploy-history.jsonl` and `releases.log` (mode 600, beside `.env`);
10. after a successful deployment only, runs the **public check**: the server fetches
    `https://redactplus.io/api/health` (up to 5 tries, 3 s apart) and `https://redactplus.io/`
    the way visitors reach them, through Cloudflare, and reports `public_health=ok` (the new
    commit), `other-commit` or `http-<code>`, and `public_home=<code>`. **It only reports**: the
    release already passed its own checks on loopback, so a Cloudflare, DNS or TLS problem never
    rolls it back. The workflow writes it to the job summary and adds a warning annotation only
    when it found a problem. (It runs on the server because Cloudflare answers 403 to GitHub's
    runners.)

It prints only `key=value` lines from a fixed set (`result`, `reason`, `release_sha`, …; a test
enforces the list) and discards all Docker and Compose output. It never reads `app.env` or any
credential.

### Publish-only modes (never deployed)

- `marketing-publish`: build, smoke-test and publish the marketing image for a release installed
  by hand (`deployment/redactplus/DEPLOYMENT.md`), when the push changed a marketing input.
  `marketing` (full deployment) takes precedence.
- `portal-publish`: build, check and publish the portal image when the push changed a portal
  input. There is no full portal deployment.
- `forum`: keep `registry.safaridesk.io/safari/redactplus-forum` up to date, tagged with the
  **forum revision** (the last commit that changed `FORUM_INPUTS` in `changed-components.mjs`,
  which mirrors `deployment/forum/Dockerfile.dockerignore`). If that tag is already in the
  registry, nothing is built or pushed. Forum host files are server configuration: a change is
  reported, never applied.

None of them contacts the server. A run whose `CD_COMPONENTS` names none of `marketing` skips the
`status` call too, so it needs only `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`.

### When nothing is deployed

| Situation | Result |
|---|---|
| Any CI check failed or was skipped | `deploy / production` is skipped by `needs:` |
| Pull request, merge-queue or manual run | Skipped by the job's `if:`; and the production environment admits `main` only |
| `CD_ENABLED` is not `true` | Plan reports "switched off"; nothing is built or pushed |
| `marketing` not in `CD_COMPONENTS` | Marketing is skipped |
| Commit is no longer the head of main | Skipped; the newer commit's own run deploys it |
| No marketing image input changed since the deployed commit (docs, tests, workflows, portal) | Skipped, with the reason in the summary |
| Same tag and digest already deployed | Server answers `skipped` (exit 3) |
| Server configuration changed (`compose.yaml`, nginx, `app.env.example`, these server files…) | Warning in the summary: **never applied automatically**, needs a reviewed manual change |

Change detection compares the commit with the one production actually runs (from `status`), so a
skipped commit's changes are picked up by the next one. If the deployed commit is unknown, not an
ancestor of the head, or nothing is deployed yet, marketing is deployed. Marketing is also rebuilt
when the running image was built without the Download dialog (no
`io.safaridesk.redactplus.portal-url` label).

**Every marketing release has Create account and Sign in.** The workflow always builds with
`NEXT_PUBLIC_PORTAL_URL=https://home.redactplus.io` and the `TURNSTILE_SITE_KEY` variable
(`build-image.sh` refuses the build without the key).

## Security review

| Risk | Control |
|---|---|
| An unmerged PR or failed commit deploys | Deployment is a job of CI's own run with `needs:` on all five checks and `if: push && refs/heads/main && this repository`. No `workflow_run`, `pull_request_target` or dispatch trigger (a test fails if one appears) |
| A PR edits the workflow to reach the secrets | Every job that references a secret runs in environment `production`, whose deployment-branch policy is `main` only. CI passes the deployment secrets by name; `secrets: inherit` is forbidden by test |
| Every merge deploys without a human | Optional **required reviewer** on `production` (recommended): each run waits at `deploy / plan` for one click |
| A stale run overwrites a newer release | CI on `main` runs one at a time per ref; the plan deploys only the current head; a concurrency group; the server refuses any run number ≤ the last deployed |
| Overlapping deployments (automatic and by hand) | `flock` on `/root/deploy/redactplus-landing/.deploy.lock`; manual releases take the same lock (below) |
| Wrong or tampered image | Built from `${{ github.sha }}` on the runner, pushed, then pinned and pulled by `sha256` digest; the server checks the revision label against the commit |
| **Deploy key is stolen** | It logs in as `redactplus-cd`, **not root**. That user has a locked password, no Docker group, owns no file anything root runs, and cannot edit its own key (root-owned `/etc/ssh/authorized_keys.d/redactplus-cd`). sshd forces the wrapper twice (key option and `ForceCommand`), with no TTY or forwarding. sudo lets it run one root-owned program with an argument matching `status`/`deploy` of marketing; the program validates again. The worst case is deploying an older legitimate marketing build, which the run-number check limits and the history records. Revoke by deleting the key file |
| Host spoofing | `StrictHostKeyChecking=yes` against the pinned `DEPLOY_SSH_KNOWN_HOSTS` |
| Secrets in logs | Registry password via `--password-stdin`; key and known_hosts written with `umask 077` to `$RUNNER_TEMP` and deleted; no `set -x`; the server program prints only whitelisted fields (tested). GitHub masks environment secrets |
| Changes beyond the image | No Keycloak, licensing, Cloudflare, DNS, nginx, firewall, portal, forum or database change is possible from the workflow or the server program. Server-config changes are only reported |
| Supply chain | Actions pinned by commit SHA; `npm ci` from lockfiles; the CI security checks run before deployment |

Residual risks, accepted for now:
- The registry push credential can push any tag in the registry. Use a dedicated account that only
  this pipeline uses, so it can be rotated or revoked on its own.
- `redactplus-deploy` runs as root on a host that also serves other projects. It is short,
  reviewed and tested; changes to it are flagged as server configuration and reinstalled by hand.

## GitHub settings (administrator)

1. **Settings → Environments → `production`:**
   - Deployment branches and tags: **Selected branches → `main`**.
   - **Required reviewers: one named approver (recommended).** Every push to main then waits at
     `deploy / plan` for one click, docs-only pushes included.
   - Environment **secrets**:

     | Secret | Value |
     |---|---|
     | `REGISTRY_USERNAME`, `REGISTRY_PASSWORD` | Dedicated push account for `registry.safaridesk.io` |
     | `DEPLOY_SSH_KEY` | Private half of the `redactplus-cd` key (below), used for nothing else |
     | `DEPLOY_SSH_KNOWN_HOSTS` | The server's ED25519 host key line, fingerprint checked (below) |
     | `DEPLOY_NOTIFY_WEBHOOK` | Optional: Slack-compatible incoming webhook (`{"text": …}`) |

   - Environment **variables**:

     | Variable | Value |
     |---|---|
     | `CD_ENABLED` | Unset (off). `true` switches automation on |
     | `CD_COMPONENTS` | `marketing`. Optionally add `forum`, `portal-publish` (publish only). `portal` is ignored |
     | `DEPLOY_HOST` | The production server's address |
     | `TURNSTILE_SITE_KEY` | Public site key of the registration security check (required for marketing builds) |

2. **Settings → Rules → Rulesets** for `main` (as in `docs/ci/README.md`): require the five CI
   checks and a reviewed pull request, and block force pushes.
3. **Settings → Actions → General:** workflow permissions "Read repository contents".

### The deploy key (on the administrator's own computer; the private key never leaves it except into the secret)

PowerShell:

```powershell
ssh-keygen -t ed25519 -C redactplus-cd-github -f $HOME\.ssh\redactplus-cd
```
(press Enter twice: no passphrase, GitHub Actions cannot type one)

```powershell
Get-Content -Raw $HOME\.ssh\redactplus-cd | gh secret set DEPLOY_SSH_KEY --env production --repo Safe-Redact/Marketing-Site
```

```powershell
ssh-keyscan -t ed25519 <DEPLOY_HOST> 2>$null | Tee-Object $HOME\.ssh\redactplus-host.txt | ssh-keygen -lf -
```
Compare the fingerprint with the one read on the server itself
(`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`); only if they match:

```powershell
Get-Content -Raw $HOME\.ssh\redactplus-host.txt | gh secret set DEPLOY_SSH_KNOWN_HOSTS --env production --repo Safe-Redact/Marketing-Site
```

Hand over only `redactplus-cd.pub` for the server installation; then delete the private key file.

## Server installation (separately authorized server change, as root)

Copy the four files from `deployment/cd/` to the server with **LF line endings** (a Windows
checkout may have CRLF; `sed -i 's/\r$//'` fixes them), then back up what changes:

```bash
ts=$(date -u +%Y%m%dT%H%M%SZ)
cp -a /etc/ssh/sshd_config /etc/ssh/sshd_config.bak-$ts
cp -a /etc/ssh/sshd_config.d /etc/ssh/sshd_config.d.bak-$ts
cp -a /etc/sudoers.d /root/sudoers.d.bak-$ts
```

```bash
# 1. The user: no password, no home, not in the docker group.
useradd --system --no-create-home --home-dir /nonexistent --shell /bin/sh redactplus-cd
passwd -l redactplus-cd

# 2. The programs (root-owned; the user can write none of them or their directories).
install -m 750 -o root -g root redactplus-deploy     /usr/local/sbin/redactplus-deploy
install -m 755 -o root -g root redactplus-deploy-ssh /usr/local/sbin/redactplus-deploy-ssh

# 3. The sudo rule, syntax-checked before it can take effect.
install -m 440 -o root -g root sudoers-redactplus-cd /root/redactplus-cd.sudoers
visudo -cf /root/redactplus-cd.sudoers && mv /root/redactplus-cd.sudoers /etc/sudoers.d/redactplus-cd
visudo -c

# 4. The key, in a root-owned file the user cannot change.
install -d -m 755 -o root -g root /etc/ssh/authorized_keys.d
printf 'restrict,command="/usr/local/sbin/redactplus-deploy-ssh" %s\n' "$(cat redactplus-cd.pub)" > /etc/ssh/authorized_keys.d/redactplus-cd
chmod 644 /etc/ssh/authorized_keys.d/redactplus-cd

# 5. sshd limits, checked before reloading (an open root session stays open meanwhile).
install -m 644 -o root -g root sshd-redactplus-cd.conf /etc/ssh/sshd_config.d/90-redactplus-cd.conf
sshd -t
sshd -T -C user=redactplus-cd,host=x,addr=192.0.2.1 | grep -Ei '^(forcecommand|permittty|authenticationmethods|authorizedkeysfile|allowtcpforwarding) '
sshd -T -C user=root,host=x,addr=192.0.2.1 | grep -Ei '^(forcecommand|permittty|authorizedkeysfile) '   # unchanged for root
systemctl reload ssh
```

Checks from a workstation with the new key: each must hold.

```bash
ssh -i redactplus-cd redactplus-cd@<DEPLOY_HOST> "status marketing"        # release_sha=…, last_run=…
ssh -i redactplus-cd redactplus-cd@<DEPLOY_HOST> "uname -a"                # result=refused
ssh -i redactplus-cd redactplus-cd@<DEPLOY_HOST> "rollback marketing 1"    # refused by sudo (operator only)
ssh -i redactplus-cd redactplus-cd@<DEPLOY_HOST> "status portal"           # refused
ssh -i redactplus-cd -t redactplus-cd@<DEPLOY_HOST>                        # no TTY, refused, no shell
ssh -i redactplus-cd -N -L 9000:127.0.0.1:6095 redactplus-cd@<DEPLOY_HOST> # forwarding refused
scp -i redactplus-cd /etc/hostname redactplus-cd@<DEPLOY_HOST>:/tmp/       # fails
```

On the server: `sudo -l -U redactplus-cd` lists exactly the one rule; `id redactplus-cd` shows no
`docker` group.

The first automatic deployment starts from `last_run=0`; the existing `.env`, `.env.previous` and
`releases.log` are kept and extended.

### Manual releases take the same lock

A release by hand (`deployment/redactplus/DEPLOYMENT.md`) must not overlap an automatic one. Run
its `.env` edit and `docker compose up -d` inside the lock:

```bash
cd /root/deploy/redactplus-landing && flock -w 600 .deploy.lock -c 'cp -p .env .env.previous && <edit .env> && docker compose up -d redactplus-landing'
```

Or switch automation off first (`CD_ENABLED`).

## Rollout

Each stage is its own approval. Do not skip ahead.

| Stage | Action | Proves |
|---|---|---|
| 0 | Merge this PR with `CD_ENABLED` unset | A push to main runs `deploy / plan`, which reports "switched off"; a PR run skips `deploy / production` |
| 1 | Server installation above; checks pass | `status` works; shell, other commands, portal, rollback, TTY and forwarding are refused |
| 2 | Secrets and variables; `CD_ENABLED=true`, `CD_COMPONENTS=marketing`; required reviewer. Merge a small marketing change | Exact commit deployed; `/api/health` commitSha matches; history line on the server and the GitHub deployment record |
| 2a | Merge a docs-only change | Plan: "no image input changed"; nothing pushed or restarted |
| 2b | Rollback drill (below), then `redactplus-deploy "rollback marketing 0"` as root | Previous digest restored automatically after a failed deployment, and on request |

### Proving the automatic rollback without breaking production

A root-only drill switch makes the next deployment fail once, after the new release has really
started and passed its checks, so the real rollback path runs:

```bash
touch /root/deploy/redactplus-landing/.drill-fail-next     # as root; the deploy user cannot
```

Then merge a small marketing change (or re-run the workflow). Expected: the new container starts,
the server reports `check=rollback-drill`, `rollback=healthy`, `result=failed`; the run fails;
`.env` is back to the previous pin, `/api/health` reports the previous commit, and
`deploy-history.jsonl` records `failed-rolled-back`. The switch removes itself. The next merge
deploys normally. Public impact: the few seconds of each container recreate.

## Turning it off, and undoing it

- **Instantly (from the next run):** set `CD_ENABLED` to anything but `true`, or remove `marketing`
  from `CD_COMPONENTS`. With a required reviewer, simply rejecting the pending run also stops it.
- **Cut the server off:** `rm /etc/ssh/authorized_keys.d/redactplus-cd` (takes effect at once).
- **Remove the whole setup (as root):**
  ```bash
  rm /etc/sudoers.d/redactplus-cd && visudo -c
  rm /etc/ssh/sshd_config.d/90-redactplus-cd.conf && sshd -t && systemctl reload ssh
  rm -r /etc/ssh/authorized_keys.d/redactplus-cd /usr/local/sbin/redactplus-deploy-ssh /usr/local/sbin/redactplus-deploy
  userdel redactplus-cd
  ```
  Then delete the `DEPLOY_SSH_KEY` and `DEPLOY_SSH_KNOWN_HOSTS` secrets. Manual releases keep
  working throughout: nothing here changes `/root/deploy` beyond `.deploy-run`, `.deploy.lock`,
  `deploy-history.jsonl` and `releases.log`.

## Rollback of a release

- **Automatic:** a deployment that fails its health or smoke checks restores the previous digest
  by itself; the run fails and the notification says `rollback=healthy` (or `unhealthy`: treat as
  an incident and use the manual steps).
- **On request, as root on the server** (the deploy key cannot do this):
  ```bash
  redactplus-deploy "rollback marketing 0"
  ```
  It restores `.env.previous`, checks health and the smoke tests, and puts the current release
  back if the previous one is not healthy. Then **switch automation off** until the fix is
  merged: otherwise the next qualifying merge redeploys.
- **Manual:** `deployment/redactplus/ROLLBACK.md` section 1 still applies: copy `.env.previous`
  over `.env`, or any older `RELEASE_SHA`/`RELEASE_DIGEST` from `releases.log`, then
  `docker compose up -d redactplus-landing` (inside the lock).

## Deployment history

- **GitHub:** each run's job summary (what was deployed before, the plan, the server's answer),
  plus the environment's deployment list under *Environments → production*.
- **Server:** `/root/deploy/redactplus-landing/deploy-history.jsonl` (one JSON object per attempt:
  time, component, action, outcome, commit, digest, run, previous) and `releases.log`.
- **Team:** the optional webhook posts one line per attempted deployment.

## Registry retention (strategy only; nothing is automated)

Each marketing deployment pushes one image (~150–350 MB of new layers) to
`registry.safaridesk.io`. Retention must be agreed and run by an operator:
1. **Keep:** the running image, its `.env.previous`, the last 10 deployed digests from
   `deploy-history.jsonl` / `releases.log`, and anything younger than 30 days; never touch other
   projects' repositories.
2. **Delete** older RedactPlus manifests **by digest** through the registry API, after a dry-run
   list has been reviewed; then `registry garbage-collect --dry-run`, review, and collect in a
   maintenance window.
3. On the server, remove only RedactPlus images that are neither running nor in `.env.previous`,
   by explicit reference: never `docker system prune` or `image prune -a`.
4. Check free space before each rollout stage; switch `CD_ENABLED` off if the disk passes 90%.

## Testing evidence

- `tests/release/redactplus-deploy.test.mjs` runs the real server program and the real SSH
  wrapper against stand-in `docker`/`curl`/`sudo` in a temporary root: status; deploy with
  history; older and equal run numbers refused; unhealthy release rolled back to `.env.previous`
  (and an unhealthy rollback reported); the drill switch fails one deployment after a real start,
  rolls back and clears itself; wrong commit served rolled back; image missing from the
  registry or with a mismatched revision label refused before any change; 31 malformed,
  injected or out-of-scope requests refused (portal, forum, shell metacharacters, bad SHA or
  digest, wrong token counts), plus zero or split arguments; a `.env` with extra keys refused;
  only whitelisted output fields; over SSH the client's command reaches the program as one
  argument through `sudo -n` and shell-like requests are refused; the sudo rule's regex admits
  only `status`/`deploy` of marketing; the sshd block forces the command with no TTY or
  forwarding; no forbidden commands.
- `tests/release/deploy-workflow.test.mjs` and `tests/release-pipeline.test.mjs`: triggers,
  gating, environment scoping of every secret, action pins, concurrency, run numbers, no `root@`
  anywhere, no job that deploys the portal or the forum, `portal` in `CD_COMPONENTS` ignored, no
  credential logging and no Keycloak, Cloudflare, nginx or registry-cleanup commands.
- `tests/release/changed-components.test.mjs`: per-image rules and server-config reporting.

Not provable before stage 1–2: the sudo regex as parsed by the server's sudo (checked with
`visudo -cf` and `sudo -l -U`), sshd's handling of the drop-in (checked with `sshd -T -C`), SSH
from a GitHub runner, and the registry push from a runner.

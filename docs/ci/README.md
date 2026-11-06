# Continuous integration

`.github/workflows/ci.yml` checks both applications in this repository:
- the marketing site (repository root, with the CMS OAuth broker in `services/cms-oauth-broker`);
- the customer portal (`apps/portal`).

It runs on:
- every pull request into `main`;
- every push to `main`, so the default branch shows its own status;
- merge-queue runs (if the queue is enabled);
- manual dispatch.

## Checks

| Check name | What it runs |
|---|---|
| `marketing / verify` | `npm ci` (root and OAuth broker), `npm run typecheck`, `npm run lint`, `npm run build` (content validation runs first, as `prebuild`), `npm test` (static, content, route and OAuth suites), whitespace check on changed lines |
| `portal / verify` | In `apps/portal`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build` (release-manifest validation first), `npm test` (unit and route suites; the route suite starts the development identity provider and the `/portal/me` stand-in on loopback) |
| `images / build` | Builds both production images as releases do: `deployment/redactplus/scripts/build-image.sh` (with its runtime-tree check) and `deployment/portal/Dockerfile`. Then runs the documented, read-only marketing smoke test against a loopback container. **No image is pushed** |
| `security / secrets` | `npm run check:secrets` (tracked files), plus gitleaks 8.30.1 over the commits the change adds. The binary is pinned by version and SHA-256, and `--redact` keeps any match out of the log |
| `security / dependencies` | `npm audit --omit=dev --audit-level=low` for all three projects (any runtime advisory fails), then `npm audit --audit-level=high` (high or critical in build tooling fails; moderate is reported). Lockfile and manifest drift fails `npm ci` in the verify jobs |

Every job builds with the production defaults: registration off, no portal URL, no lead delivery,
CMS disabled. That is also what the route suites expect.

## Safety properties

- **Permissions:** `contents: read` only. Every checkout uses `persist-credentials: false`.
- **No secrets in the checks:** the five check jobs reference no secrets or credentials. They
  never log in to a registry, never push an image, never use SSH, and run the same way for forks
  and Dependabot pull requests. Only the separate deployment workflow, called after the checks
  on `main`, uses the `production` environment's secrets.
- **Pinned actions:** only `actions/checkout` and `actions/setup-node` (v6.0.0), pinned by commit
  SHA.
- **Guard tests:** `tests/release-pipeline.test.mjs` enforces these rules (triggers, permissions,
  job names, pins, the single gated deployment path); `tests/release/` covers the deployment.

## Retired: `release.yml`

The former `.github/workflows/release.yml` packaged a "provider-neutral blue-green bundle"
artifact (named `saferedact-<sha>`) on pushes to `master`.
- `master` no longer exists, so the workflow could never trigger.
- The production rollout uses digest-pinned Docker images instead, so nothing consumed its
  output.

It was removed in this change and **not** replaced. The `release:package` and `release:verify`
npm scripts remain for anyone who still needs the bundle locally. The old `ci.yml` triggers
(`master` and `feat/saferedact-publishing-and-comments`) are gone too.

## Automatic deployment

CI's checks never deploy. A sixth job, `deploy / production`, runs only for a push to `main` in
this repository and only after all five checks above succeeded for that commit. It calls
`.github/workflows/deploy-production.yml`, whose secret-bearing jobs run in the GitHub
Environment `production` (main only). It does nothing until the environment variable
`CD_ENABLED` is `true`. Settings, the server-side forced command, security review, rollout and
rollback: `deployment/cd/README.md`.

## Expected first-run adjustments

These could not be verified before the first GitHub run:
- **gitleaks on CI:** the local run (gitleaks 8.30.1 over the branch's own commit range) is
  recorded in the pull request. If a test fixture is flagged on CI, add a minimal `.gitleaks.toml`
  allowlist for that path only.
- **Linux runner:** the suites have run on Windows. The two Docker builds and the smoke test have
  not run on Linux at all. There is no Docker on the development machine; the marketing image was
  last built for the 2 November release. Watch the first run's `images / build` job and its
  timings; each job has a 30-minute limit.

## GitHub settings an administrator must apply

1. **Settings → Actions → General:**
   - Actions allowed for this repository;
   - workflow permissions "Read repository contents";
   - "Allow GitHub Actions to create and approve pull requests" off.
2. **Settings → Rules → Rulesets** for `main`, after the checks have run at least once:
   - require a pull request: 1 approval, dismiss stale approvals, approval of the most recent
     push, conversation resolution;
   - require status checks, with branches up to date:
     - `marketing / verify`
     - `portal / verify`
     - `security / secrets`
     - `security / dependencies`
     - `images / build` (once stable);
   - block force pushes and deletions, with no bypass (or a named, recorded emergency bypass).
3. **Optional:**
   - enable the merge queue (the workflow already listens to `merge_group`);
   - require signed commits;
   - Dependabot security updates;
   - secret scanning and push protection, where the plan includes them.

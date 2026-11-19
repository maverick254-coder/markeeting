#!/usr/bin/env bash
# Packages the CMS login broker of one exact commit for /root/deploy/redactplus-cms-oauth/app.
#
#   deployment/cms-oauth/package-broker.sh <git-ref> [output.tar]
#
# Only package.json and src/ are exported, with `git archive`, so local edits, tests,
# .env.local files and certificates never leave this machine. The tarball's name and a
# REVISION file inside it carry the full commit SHA. Nothing is copied anywhere.
set -euo pipefail

ref="${1:?usage: package-broker.sh <git-ref> [output.tar]}"
repository_root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
commit="$(git -C "$repository_root" rev-parse --verify "${ref}^{commit}")"
output="${2:-redactplus-cms-oauth-${commit}.tar}"

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

git -C "$repository_root" -c core.autocrlf=false archive --format=tar "$commit" \
  services/cms-oauth-broker/package.json services/cms-oauth-broker/src \
  | tar -x -C "$staging"
mv "$staging/services/cms-oauth-broker" "$staging/app"
echo "$commit" > "$staging/app/REVISION"

# The broker must start with nothing but Node: no dependencies to install.
node -e '
  const p = require(process.argv[1]);
  if (p.type !== "module") throw new Error("package.json must declare type: module");
  if (Object.keys({ ...p.dependencies, ...p.optionalDependencies }).length) throw new Error("the broker must have no runtime dependencies");
' "$staging/app/package.json"
for file in "$staging"/app/src/*.mjs; do node --check "$file"; done

tar -C "$staging" -cf "$output" app
echo "Packaged ${commit} ($(git -C "$repository_root" log -1 --format=%s "$commit"))"
echo "  ${output}: $(tar -tf "$output" | grep -c '^app/src/.*\.mjs$') source files"

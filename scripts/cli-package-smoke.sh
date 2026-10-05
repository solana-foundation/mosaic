#!/usr/bin/env bash
# Pack @solana/mosaic-sdk and @solana/mosaic-cli, install the tarballs into a
# scratch project OUTSIDE the workspace (so the package manager can't silently
# substitute the workspace link), and run the CLI the way an `npm i -g` user
# would. Catches broken emitted specifiers, the zk-sdk wasm crash, files/bin
# wiring, and missing dependencies — the class of bug a green `tsc -b` cannot
# see. Requires `pnpm run build` to have run first.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/mosaic-cli-smoke.XXXXXX")"
trap 'rm -rf "$workdir"' EXIT

pkg_dir="$workdir/pkg"
smoke_dir="$workdir/smoke"
mkdir -p "$pkg_dir" "$smoke_dir"

cd "$repo_root"
pnpm --filter @solana/mosaic-sdk exec pnpm pack --pack-destination "$pkg_dir"
pnpm --filter @solana/mosaic-cli exec pnpm pack --pack-destination "$pkg_dir"

cd "$smoke_dir"
npm init -y >/dev/null
# Installing both tarballs together pins the CLI's @solana/mosaic-sdk range to
# the local build instead of whatever is on the npm registry.
npm install --no-audit --no-fund \
    "$pkg_dir"/solana-mosaic-sdk-*.tgz \
    "$pkg_dir"/solana-mosaic-cli-*.tgz

npx mosaic --version
npx mosaic --help
npx mosaic inspect-mint --help
npx mosaic create stablecoin --help

# The published SDK must be importable in plain Node too. This runs under the
# CLI's zk-sdk resolve hook: upstream token-2022's wasm entry is unloadable in
# Node without it (see packages/cli/bin/), and the hook does not mask SDK
# specifier bugs — the SDK's own relative imports resolve before the zk edge.
node --import ./node_modules/@solana/mosaic-cli/bin/register-zk-node.mjs \
    --input-type=module \
    -e "const m = await import('@solana/mosaic-sdk'); if (Object.keys(m).length === 0) throw new Error('SDK loaded but exported nothing'); console.log('SDK OK: ' + Object.keys(m).length + ' exports');"

echo "CLI package smoke test passed"

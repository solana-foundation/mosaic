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

# The published SDK must be importable in plain Node too, with no resolve hook:
# upstream token-2022 statically imports `@solana/zk-sdk/bundler`, whose wasm
# entry used to be unloadable in Node — zk-sdk 0.5.2 added the `node` condition
# on that subpath, so plain `node` now resolves it on its own.
node --input-type=module \
    -e "const m = await import('@solana/mosaic-sdk'); if (Object.keys(m).length === 0) throw new Error('SDK loaded but exported nothing'); console.log('SDK OK: ' + Object.keys(m).length + ' exports');"

# The root barrel above covers token-2022's `@solana/zk-sdk/bundler` edge, but not
# the SDK's own `./_zk` -> `@solana/zk-sdk/node` export condition, and not the
# single-resolved-copy invariant the wasm classes rely on ("expected instance of
# ElGamalKeypair" when two copies get loaded). Import the confidential subpath and
# run one real derivation through the wasm, signing with plain node crypto so the
# check needs no extra dependency and no network.
node --input-type=module -e "
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
const c = await import('@solana/mosaic-sdk/confidential');
for (const name of ['deriveConfidentialKeys', 'getConfidentialMintBurnInit', 'freeConfidentialKeys']) {
    if (typeof c[name] !== 'function') throw new Error('confidential subpath missing ' + name);
}
const { privateKey } = generateKeyPairSync('ed25519');
// deriveConfidentialKeys only needs 'address' (to index the result) and
// 'signMessages', so a minimal ed25519 signer stands in for a wallet.
const signer = {
    address: 'smoke',
    signMessages: async messages => messages.map(m => ({ smoke: new Uint8Array(edSign(null, m.content, privateKey)) })),
};
const keys = await c.deriveConfidentialKeys({ signer });
try {
    const init = c.getConfidentialMintBurnInit(keys);
    if (typeof init.supplyElgamalPubkey !== 'string') throw new Error('supplyElgamalPubkey is not an address');
    if (init.decryptableSupply.length !== 36) throw new Error('decryptableSupply is not 36 bytes');
    console.log('confidential subpath OK: wasm derivation + supply init');
} finally {
    c.freeConfidentialKeys(keys);
}
"

# The checks above all stay inside @solana/mosaic-sdk's own dependency cone. The
# sRFC-37 / ABL paths additionally cross into @solana/token-acl-sdk, which
# declares HARD deps on @solana/kit ^6 and @solana-program/token-2022 0.12.0
# while this SDK is on kit ^8 / token-2022 0.18.0. Inside the monorepo the root
# pnpm overrides reconcile that, but overrides do NOT propagate to a published
# consumer — which is exactly the tree this scratch project reproduces. Report
# what actually resolved, then drive one RPC-free token-acl code path through it.
echo "--- resolved copies in the consumer tree ---"
for pkg in @solana/kit @solana-program/token-2022 @solana/zk-sdk; do
    # -not -path prunes nested node_modules of the SAME package from its own subtree.
    find node_modules -path "*/$pkg/package.json" -not -path '*/.bin/*' 2>/dev/null |
        while read -r manifest; do
            printf '  %-32s %s  (%s)\n' "$pkg" \
                "$(node -p "require('./$manifest').version")" "${manifest%/package.json}"
        done
done

node --input-type=module -e "
const { getCreateConfigInstructions, TOKEN_ACL_PROGRAM_ID } = await import('@solana/mosaic-sdk');
const authority = {
    address: 'FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT',
    signTransactions: async txs => txs.map(() => ({})),
};
const { instructions, mintConfig } = await getCreateConfigInstructions({
    authority,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    gatingProgram: TOKEN_ACL_PROGRAM_ID,
});
// findMintConfigPda + getCreateConfigInstruction both live in @solana/token-acl-sdk
// and run against ITS resolved @solana/kit. A second, incompatible kit copy shows
// up here as a throw or as a malformed address/instruction rather than silently.
if (typeof mintConfig !== 'string' || mintConfig.length < 32) {
    throw new Error('token-acl returned a malformed mint config PDA: ' + mintConfig);
}
if (!instructions.length || !instructions[0].programAddress) {
    throw new Error('token-acl returned no usable instruction');
}
console.log('token-acl path OK: mintConfig ' + mintConfig);
"

echo "CLI package smoke test passed"

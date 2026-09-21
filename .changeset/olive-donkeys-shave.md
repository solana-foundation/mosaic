---
'@solana/mosaic-sdk': minor
'@solana/mosaic-cli': patch
---

Move confidential mint/burn onto the published `@solana-program/token-2022@0.15.0`

The confidential mint/burn instruction-plan helpers were upstreamed in
[token-2022#1357](https://github.com/solana-program/token-2022/pull/1357) and ship in `0.15.0`, so the
SDK now consumes them directly instead of a local build. `0.15.0` is a hard floor — `0.13.0` and
`0.14.x` do not carry the helpers.

**Breaking — confidential key derivation changed.** Account keys are now **wallet-only**:
`deriveConfidentialKeys({ signer })` takes one signature over the canonical
`b"solana-conf-bal/v1"` message with an empty seed (`@solana/zk-sdk` 0.5.x's
`ConfidentialKeys.signerMessage`/`fromSignature`), so the same wallet derives the same keys for
every mint and token account it holds. This is the cross-client standard, so keys derived here are
byte-identical to keys derived by any other conforming tool for the same wallet.
`deriveConfidentialKeysForOwnerMint` and the token-account-seeded `deriveConfidentialKeys`
overload are **removed** — there is no seed to bind any more.

`deriveConfidentialSupplyKeys` is unchanged and stays seeded, under the Mosaic-specific
`mosaic-conf-supply/v1` domain tag. That separation is what keeps a `ConfidentialMintBurn` mint's
supply keys from coinciding with the mint authority's own wallet-only balance keys.

The new scheme produces **different keys** from every previous release. An account configured
under an earlier version cannot have its keys re-derived by this one — its balances stay
decryptable only with the retained key bytes. Export and store the key material for any live
confidential account before upgrading.

Also in this release:

- Peer dependencies moved with token-2022: `@solana/zk-sdk` to `^0.5.1` and
  `@solana-program/zk-elgamal-proof` to `^0.3.2`.
- `proofMode: 'context-state'` is no longer passed to the transfer/withdraw helpers; 0.15.0 dropped
  the option and uses context-state proofs for these flows unconditionally.
- Fixed a WebAssembly memory leak in `deriveConfidentialKeys`: the intermediate `ConfidentialKeys`
  pair is now freed once its ElGamal and AES components have been taken.
- Browser wallets that refuse to sign the derivation message now get a diagnostic error instead of
  the raw signer failure, and a genuine user rejection is re-thrown unwrapped.

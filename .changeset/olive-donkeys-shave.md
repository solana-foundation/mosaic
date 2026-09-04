---
'@solana/mosaic-sdk': minor
'@solana/mosaic-cli': patch
---

Move confidential mint/burn onto the published `@solana-program/token-2022@0.15.0`

The confidential mint/burn instruction-plan helpers were upstreamed in
[token-2022#1357](https://github.com/solana-program/token-2022/pull/1357) and ship in `0.15.0`, so the
SDK now consumes them directly instead of a local build. `0.15.0` is a hard floor — `0.13.0` and
`0.14.x` do not carry the helpers.

**Breaking — confidential key derivation changed.** `deriveConfidentialKeys` now takes **one**
signature over the canonical `b"solana-conf-bal/v1" || seed` message (`@solana/zk-sdk` 0.5.x's
`ConfidentialKeys.fromSignature`), replacing the previous two signatures over
`b"ElGamalSecretKey" || seed` and `b"AeKey" || seed`. `deriveConfidentialKeysForOwnerMint` and
`deriveConfidentialSupplyKeys` inherit the same switch from token-2022 0.15.0.

The two schemes produce **different keys**. An account configured under a previous release cannot
have its keys re-derived by this one — its balances stay decryptable only with the retained key
bytes. Export and store the key material for any live confidential account before upgrading.

Also in this release:

- Peer dependencies moved with token-2022: `@solana/zk-sdk` to `^0.5.1` and
  `@solana-program/zk-elgamal-proof` to `^0.3.2`.
- `proofMode: 'context-state'` is no longer passed to the transfer/withdraw helpers; 0.15.0 dropped
  the option and uses context-state proofs for these flows unconditionally.
- Fixed a WebAssembly memory leak in `deriveConfidentialKeys`: the intermediate `ConfidentialKeys`
  pair is now freed once its ElGamal and AES components have been taken.

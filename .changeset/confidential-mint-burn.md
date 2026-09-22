---
'@solana/mosaic-sdk': major
'@solana/mosaic-cli': major
---

Add confidential mint & burn, on the published `@solana-program/token-2022@0.15.0`

Token-2022 `ConfidentialMintBurn` support: minting tokens directly **into** a confidential balance and burning them **from** one, with the amount encrypted on-chain rather than routed through a plaintext mint+deposit or withdraw+burn. `ConfidentialMintBurn` is a separate extension from `ConfidentialTransferMint`, and a mint-burn mint needs **both** — accounts must be confidential-transfer configured to hold the minted balance.

The instruction-plan helpers were upstreamed in [token-2022#1357](https://github.com/solana-program/token-2022/pull/1357) and ship in `0.15.0`, so the SDK consumes them directly rather than generating the three mint/burn proofs itself. `0.15.0` is a hard floor — `0.13.0` and `0.14.x` do not carry the helpers.

**Breaking — the SDK moves to the Solana Kit v7 ecosystem.** `@solana/kit` and `@solana/sysvars` go `^6.10` → `^7.0`, and `@solana-program/token-2022` `^0.10` → `0.15.0`. These are regular dependencies, so an app still on kit v6 that upgrades resolves two kit copies and gets structurally incompatible `Rpc`, `TransactionSigner` and `InstructionPlan` types. Upgrade the whole ecosystem together. `@solana/zk-sdk` moves to `^0.5.2` and `@solana-program/zk-elgamal-proof` to `^0.3.2` alongside it.

**New — confidential mint/burn API**

- `Token.withConfidentialMintBurn({ supplyElgamalPubkey, decryptableSupply })`, composing with `withConfidentialBalances`. Kept WASM-free at the builder: precompute the two init values with `getConfidentialMintBurnInit(keys)`.
- `createConfidentialMintInstructionPlan` — mint into a confidential balance.
- `createConfidentialBurnInstructionPlan` — burn from one (uses the permissioned variant automatically on a `PermissionedBurn` mint).
- `createApplyConfidentialPendingBurnInstructionPlan` — apply the mint's pending burn; pass `resyncSupply` to get the required decryptable-supply re-assertion in the same ordered plan.
- `createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan` — re-assert the decryptable supply on its own.
- `inspectToken` now surfaces the `ConfidentialMintBurn` supply pubkey and decryptable supply.

Supply keys are the **supply authority wallet's** `deriveConfidentialKeys` output. Because derivation is wallet-only (no mint or role seed), those keys are also that wallet's confidential _account_ keys for every mint it holds — so the supply authority must be a dedicated wallet holding no confidential balances. The mint and supply builders check the supplied keys against the mint's registered supply pubkey and fail fast rather than letting a wrong-wallet key surface later as an opaque on-chain proof rejection.

Each mint/burn stages its proofs in context-state accounts, so a plan spans multiple transactions (proof setup → token instruction → cleanup). Callers should account for context-state cleanup on partial failure. Amounts are capped at 2⁴⁸ − 1. Rotating the supply ElGamal keypair (`RotateSupplyElgamalPubkey`) is not built yet — it needs its own re-encryption equality proof.

**Breaking — plaintext and convert paths now reject `ConfidentialMintBurn` mints.** A mint-burn mint has no plaintext balance side, so these throw with a message pointing at the confidential equivalent instead of building a transaction the program would reject:

- `createMintToTransaction`, `createBurnTransaction`, `createForceBurnTransaction`, `createPermissionedBurnTransaction`
- `createConfidentialDepositInstructionPlan`, `createConfidentialWithdrawInstructionPlan`

Also in this release:

- `proofMode: 'context-state'` is no longer passed to the transfer/withdraw helpers; `0.15.0` dropped the option and uses context-state proofs for those flows unconditionally.
- Fixed the stablecoin, arcade-token, tokenized-security, custom-token and MMF templates rejecting a bare `Address` as `mintAuthority`. Each template's signature already accepted `Address | TransactionSigner`, but it forwarded the raw value to `buildInstructions`, which throws (`mintAuthority must be a TransactionSigner<string>`) whenever the TokenMetadata extension is present — as it is on every template. The mint authority is now normalized to a no-op signer first, so raw-transaction flows work.
- Fixed a WebAssembly memory leak in `deriveConfidentialKeys`: the intermediate `ConfidentialKeys` pair is freed once its ElGamal and AES components have been taken.
- `@solana/mosaic-cli` no longer declares `@solana/zk-sdk`; it has no direct use for it, and a second resolved copy instantiates a second WASM module, breaking class identity (`expected instance of ElGamalKeypair`). Its Node module-resolution hook (`bin/register-zk-node.mjs`, `bin/zk-node-resolve-hook.mjs`) is removed along with it — the hook existed only to redirect token-2022's `@solana/zk-sdk/bundler` import to the CJS Node build, and `@solana/zk-sdk@0.5.2` ships that `node` condition upstream. `@solana/mosaic-sdk` therefore declares `@solana/zk-sdk` at `^0.5.2` (up from `^0.5.1`), which is now the floor for loading the SDK under plain Node.

# @solana/mosaic-cli

## 0.2.0

### Minor Changes

- [#100](https://github.com/solana-foundation/mosaic/pull/100) [`3a6d8c5`](https://github.com/solana-foundation/mosaic/commit/3a6d8c5dc30f84d0cdd7a24b8f8429edf65f2e90) Thanks [@eldarik](https://github.com/eldarik)! - Solana Kit v6, confidential balances, permissioned burn, the MMF template, transaction parsing, and three sRFC-37 correctness fixes.

    This is the first release since `0.1.3` (`gitHead dff90e7`, 2026-05-26) and it collects eleven PRs of SDK work. Despite the minor version label, **it contains changes that will break existing callers**. Read the notes below before upgrading.

    ## Dependencies: Solana Kit v5 → v6

    The SDK now targets the Kit v6 ecosystem. Consumers on Kit v5 must upgrade in lockstep, because Kit types are structurally incompatible across the major.

    | Package                      | `0.1.3`   | `0.2.0`                                        |
    | ---------------------------- | --------- | ---------------------------------------------- |
    | `@solana/kit`                | `^5.0.0`  | `^6.10.0`                                      |
    | `@solana/sysvars`            | `^5.0.0`  | `^6.10.0`                                      |
    | `@solana-program/system`     | `^0.10.0` | `0.12.2` (exact)                               |
    | `@solana-program/memo`       | `^0.10.0` | `^0.11.2`                                      |
    | `@solana-program/token-2022` | `^0.6.1`  | `^0.10.0`                                      |
    | `@solana/token-acl-gate-sdk` | `^0.2.0`  | `^0.3.0`                                       |
    | `@token-acl/sdk`             | `^0.2.7`  | **renamed** → `@solana/token-acl-sdk` `^0.4.0` |

    Two pins are deliberate and load-bearing:

    - **Kit is capped at `6.x`, not `7.x`** — the token-acl SDKs peer-depend on `@solana/kit ^6.0.0`.
    - **`@solana-program/token-2022` stays on `0.10.0`** — it still ships the confidential-transfer `InstructionPlan`/derive helpers (`getConfidentialTransferInstructionPlan`, `deriveAeKeyForOwnerMint`) that the confidential feature depends on; these were removed in `0.12.0`.

    Both are documented in full, along with the transitive overrides they require, in `_dependencyNotes` in `packages/sdk/package.json` and the root `package.json`. If you consume this SDK from a workspace that resolves `@solana/*` transitively, mirror those overrides — otherwise `@solana-program/zk-elgamal-proof` (which declares a v5 peer) and `@solana/token-acl-sdk` (which hard-depends on token-2022 `0.12.0`) will pull a split ecosystem into your lockfile.

    ## Breaking changes

    **`getSetExtraMetasInstructions` / `getSetExtraMetasTransaction`: input field `lists` renamed to `addresses`.** Because it's an optional-looking field on an input object, a missed rename fails at runtime with an empty address set rather than at compile time in loosely-typed callers. Update every call site.

    ```diff
     await getSetExtraMetasInstructions({
         authority,
         mint,
    -    lists: [listConfig],
    +    addresses: [listConfig],
     });
    ```

    **sRFC-37 templates no longer skip Token-ACL/ABL setup when the fee payer differs from the mint authority.** Previously, passing `feePayer !== mintAuthority` caused the templates to early-return a bare mint with no list configuration — a silent, hard-to-diagnose misconfiguration that surfaced later as `0x11 AccountFrozen` on the first mint. The setup instructions are now always emitted, which means **the returned transaction requires the mint authority's signature** even when a distinct fee payer pays. Sponsored-deploy flows that only signed with the fee payer must add the mint authority as a signer.

    **On the sRFC-37 path, the `freezeAuthority` argument is ignored.** It is forced to the mint authority, because ABL list management derives its config PDA from the freeze authority and sRFC-37 requires the two to coincide. Passing a distinct `freezeAuthority` alongside `enableSrfc37: true` now silently has no effect rather than producing a mint whose lists can never be managed.

    **`createStablecoinInitTransaction` gained a 16th positional parameter** — `confidentialBalances?: ConfidentialBalancesConfig`, after `freezeAuthority`. Purely additive for callers that pass fewer arguments, but any code spreading a positional argument array, or wrapping the function with its own fixed arity, needs updating. (`createArcadeTokenInitTransaction` is unchanged at 13 parameters; the newer templates take an options object and grew additively.)

    **`createBurnTransaction` and `createForceBurnTransaction` gained a trailing optional `permissionedBurnAuthority?: Address | TransactionSigner<string>`.** Additive, with the same positional-arity caveat.

    ## New

    **Confidential balances, as a separate subpath export.** Beyond enabling the extension at mint creation, the SDK now implements the confidential runtime: configure/approve account, deposit/apply/withdraw, confidential transfer, empty account, and confidential mint/burn.

    These live at **`@solana/mosaic-sdk/confidential`** and are deliberately **not** re-exported from the root barrel, so that the `@solana/zk-sdk` WASM proof/crypto dependency stays out of the import graph of consumers that don't need it. A `./_zk` subpath provides the browser/node conditional split.

    ```ts
    import { createConfidentialTransactionPlanner } from '@solana/mosaic-sdk/confidential';
    ```

    **Permissioned Burn extension** support across templates, management (`burn`, `force-burn`), and inspection.

    **MMF template and lock primitives** — `createMmfInitTransaction` plus lock-address derivation, lock-account init, lock ops, and paused-action helpers, exported from the root barrel.

    **Transaction parsing** — `parseTokenTransaction`, `parseTokenTransactionWithLookups`, and `parseConfirmedTransaction` in `inspection`, for decoding Token-2022 instructions out of built or confirmed transactions.

    **Template surface** — `tokenized-security` and `custom-token` templates gained `permissionedBurnAuthority`, `confidentialBalances`, transfer-fee and confidential-transfer-fee options; templates also expose the confidential approve policy and auditor ElGamal key.

    ## Known limitation: neither package runs under plain Node ESM

    `packages/sdk` and `packages/cli` still build with `"moduleResolution": "bundler"`, so `tsc` accepts extensionless relative import specifiers and emits them verbatim. Node's ESM loader requires the explicit `.js`, so:

    - **`@solana/mosaic-cli@0.2.0` cannot execute a single command.** `node dist/index.js` fails with `ERR_MODULE_NOT_FOUND`; running from source hits `ERR_UNKNOWN_FILE_EXTENSION ".wasm"` on `@solana/zk-sdk`'s bundler-target build. This is not a regression — `0.1.2` is equally broken — and the version bump here is a consequence of the workspace dependency on the SDK, not a signal that the CLI works. **The CLI is published in this release but is not usable.**
    - **`import '@solana/mosaic-sdk'` fails under plain Node ESM** for the same reason. It works through any bundler, and through Vite/Vitest with `server.deps.inline`, which is the workaround consumers are currently carrying.

    A fix (`nodenext` resolution across both packages, plus a `.wasm` resolve hook for the CLI binary) is tracked and targeted at `0.2.1`. `tsc -b` passes cleanly in both cases, which is why CI has never caught it.

### Patch Changes

- Updated dependencies [[`3a6d8c5`](https://github.com/solana-foundation/mosaic/commit/3a6d8c5dc30f84d0cdd7a24b8f8429edf65f2e90)]:
    - @solana/mosaic-sdk@0.2.0

# @solana/mosaic-sdk

TypeScript SDK for building and operating Token-2022 mints with modern extensions. Batteries-included templates (Stablecoin, Arcade Token, Tokenized Security), and access-control management via Token ACL (SRFC-37). It is unopinionated about what kind of signer you use, whether that's a connected wallet, filesystem wallet, or 3rd party key management system.

## Key features

- **Templates**: One-call mint initialization for Stablecoin, Arcade Token, and Tokenized Security
- **Access control**: Create and manage allowlists/blocklists (ABL, SRFC-37 compliant)
- **Operations**: Mint, force-transfer (via permanent delegate), freeze/thaw, permissionless thaw (Token ACL)
- **Confidential balances**: Configure accounts, deposit/withdraw, and confidential transfers with encrypted amounts (via the `@solana/mosaic-sdk/confidential` subpath)
- **Authorities**: Update mint, freeze, metadata, and other authorities
- **Utilities**: Resolve ATAs, decimal math, transaction B64/B58 encoding

## Installation

```bash
pnpm add @solana/mosaic-sdk
# or
npm i @solana/mosaic-sdk
```

The SDK uses `@solana/kit` (RPC + SPL helpers) transitively; you can import helpers/types directly from `@solana/kit` in your app.

> **Note on Solana Kit v5:** This SDK uses the Solana Kit v5.0 ecosystem (`@solana/kit@^5.0.0`, `@solana/sysvars@^5.0.0`, `@solana-program/token-2022@^0.6.1`). These packages are published to npm under an experimental/next tag and may not appear as the "latest" version on npmjs.com. The monorepo uses pnpm overrides (in the root `pnpm-lock.yaml`) to ensure consistent version resolution across all `@solana/*` packages. See the [Anza Kit repository](https://github.com/anza-xyz/kit) for upstream details.

## Quick start

```ts
import { createStablecoinInitTransaction, transactionToB64 } from '@solana/mosaic-sdk';
import { createSolanaRpc, generateKeyPairSigner } from '@solana/kit';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const mint = await generateKeyPairSigner();
const feePayer = YOUR_FEEPAYER_ADDRESS;

// Single-signer path: when the fee payer is also the mint authority,
// the template also configures Token ACL + ABL for you.
const tx = await createStablecoinInitTransaction(
    rpc,
    'USD Coin', // name
    'USDC', // symbol
    6, // decimals
    'https://example.com/metadata.json',
    feePayer.address, // mintAuthority
    mint, // mint signer
    feePayer, // fee payer signer
);

// Hand off to a wallet, or encode and submit via your backend
const b64 = transactionToB64(tx);
```

### Notes on templates and authorities

- If `mintAuthority === feePayer.address`, templates will also:
    - create Token ACL mint config, set gating program to ABL
    - create an ABL list (allowlist for Arcade, blocklist by default for Stablecoin)
    - set ABL extra metas on the mint
    - enable Token ACL permissionless thaw
- If authorities differ, the template returns a transaction with just the Token-2022 mint setup. Run the Token ACL management yourself (see examples below).

## Templates (issuance)

All templates freeze new accounts by default and rely on Token ACL permissionless thaw and ABL allow/block lists to control who can hold tokens.

```ts
import {
    createStablecoinInitTransaction,
    createArcadeTokenInitTransaction,
    createTokenizedSecurityInitTransaction,
} from '@solana/mosaic-sdk';
import { createSolanaRpc, generateKeyPairSigner } from '@solana/kit';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const feePayer = YOUR_FEEPAYER_ADDRESS;
const mint = await generateKeyPairSigner();

// Stablecoin (metadata, pausable, confidential balances, permanent delegate)
await createStablecoinInitTransaction(
    rpc,
    'USD Token',
    'USDtoken',
    6,
    'https://example.com/metadata.json',
    feePayer.address,
    mint,
    feePayer,
    /* aclMode?: 'allowlist' | 'blocklist' (default: 'blocklist'), optional authorities... */
);

// Arcade token (metadata, pausable, permanent delegate, allowlist)
await createArcadeTokenInitTransaction(
    rpc,
    'Arcade Points',
    'POINTS',
    0,
    'https://example.com/points.json',
    feePayer.address,
    mint,
    feePayer,
);

// Tokenized security (stablecoin extensions + Permissioned Burn + Scaled UI Amount)
await createTokenizedSecurityInitTransaction(
    rpc,
    'Acme Series A',
    'ACMEA',
    0,
    'https://example.com/security.json',
    feePayer.address,
    mint,
    feePayer,
    {
        aclMode: 'blocklist',
        scaledUiAmount: {
            multiplier: 1000, // show 1 on-chain unit as 1000 UI units
            newMultiplierEffectiveTimestamp: 0,
            newMultiplier: 1000,
        },
    },
);
```

## Token management

```ts
import { createMintToTransaction } from '@solana/mosaic-sdk';
import { createSolanaRpc, generateKeyPairSigner } from '@solana/kit';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const feePayer = await generateKeyPairSigner();
const mintAuthority = feePayer; // or a different signer

// Mint 10.5 tokens to a recipient (ATA auto-creation, permissionless thaw if needed)
const tx = await createMintToTransaction(
    rpc,
    'MintPubkey...', // mint
    'RecipientWallet...', // recipient wallet (or ATA)
    10.5, // decimal amount
    mintAuthority,
    feePayer,
);
```

### Force transfer (Permanent Delegate)

```ts
import { createForceTransferTransaction } from '@solana/mosaic-sdk';

const tx = await createForceTransferTransaction(
    rpc,
    'MintPubkey...',
    'FromWalletOrAta...',
    'ToWalletOrAta...',
    1.25,
    'PermanentDelegateAddressOrSigner...',
    feePayer,
);
```

### Burn and Permissioned Burn

Mints with the permissioned burn extension reject regular burns: the configured burn authority must co-sign. `createBurnTransaction` and `createForceBurnTransaction` detect the extension automatically and route to the permissioned burn instruction, defaulting the co-signer to the authority configured on the mint.

```ts
import {
    createBurnTransaction,
    createPermissionedBurnTransaction,
    getPermissionedBurnAuthority,
} from '@solana/mosaic-sdk';

// Self-burn (auto-detects permissioned burn; pass the authority signer if it isn't the owner)
const tx = await createBurnTransaction(rpc, 'MintPubkey...', owner, 1.25, feePayer, burnAuthoritySigner);

// Explicit permissioned burn from any account (owner + burn authority co-sign)
const tx2 = await createPermissionedBurnTransaction(
    rpc,
    'MintPubkey...',
    'FromWalletOrAta...',
    1.25,
    burnAuthoritySigner,
    feePayer,
);

// Read the configured burn authority (null if the extension is absent or cleared)
const authority = await getPermissionedBurnAuthority(rpc, 'MintPubkey...');
```

The burn authority can be rotated or removed with `getUpdateAuthorityTransaction` / `getRemoveAuthorityTransaction` using `AuthorityType.PermissionedBurn`; removing it re-enables regular burns.

## Confidential balances & transfers

The SDK supports the Token-2022 Confidential Transfer extension: token amounts are encrypted on-chain (under a per-account ElGamal + AES key pair) while remaining publicly auditable, across the standard flow (configure → deposit → apply → transfer → withdraw → empty).

> **Import path.** Everything below imports from the dedicated
> `@solana/mosaic-sdk/confidential` subpath — _not_ the package root. This subpath
> pulls in the `@solana/zk-sdk` WASM proof/crypto dependency, which is deliberately
> kept out of the root barrel so plain (non-confidential) imports stay lightweight.
>
> **Cluster requirement.** Confidential operations verify zero-knowledge proofs via
> the ZK ElGamal Proof Program, which must be live on the target cluster. In practice
> that means **devnet**: it is not always enabled on mainnet, and a stock local
> validator fails these flows (deposit returns `InvalidInstructionData`), which is why
> `pnpm test:integration` skips every confidential suite. Several operations span
> multiple transactions to set up and reclaim proof context-state accounts.
>
> **Memory.** `ConfidentialKeys` hold WASM-backed memory — call
> `freeConfidentialKeys(keys)` when you're done with them.

### 1. Enable at mint creation

Use the `Token` builder to add the extension. `policy` is `'opt-in'` (accounts
self-configure) or `'whitelist'` (default — accounts must be approved by the
confidential-transfer authority before use).

```ts
import { Token } from '@solana/mosaic-sdk';

const tx = await new Token()
    .withConfidentialBalances({ authority: mintAuthority.address, policy: 'opt-in' })
    .buildTransaction({ rpc, decimals: 2, mintAuthority, mint, feePayer });
```

### 2. Derive account keys

Each holder derives an ElGamal keypair + AES key from a single wallet signature — deterministic, never stored on-chain, and **wallet-only**: there is no owner/mint/token-account seed, so the same signer always derives the same account keys for every mint and token account it holds.

> Because a wallet has exactly one confidential key pair, there is no in-wallet separation to rely on: a role that must not share keys with a holder, such as an auditor, needs its own wallet.

```ts
import { deriveConfidentialKeys, freeConfidentialKeys } from '@solana/mosaic-sdk/confidential';

const keys = await deriveConfidentialKeys({
    signer: owner, // a MessagePartialSigner (wallet / filesystem keypair)
});
// ... use keys ...
freeConfidentialKeys(keys); // release WASM memory when done
```

> **Browser wallets.** Don't feed a UI wallet-connection framework's own `signMessage`
> straight into `signer` above — several such libraries mishandle the Wallet
> Standard `solana:signMessage` result or silently demote specific wallets to a
> broken signing path. Import `@solana/mosaic-sdk/confidential/wallet-standard`
> and wrap your framework's fallback signer with `createResilientSignMessage(owner,
fallbackSignMessage)`, then `createMessageSigner(owner, signMessage)` to get the
> `MessagePartialSigner` this function needs.

### 3. Configure the account

Creates the ATA (if needed), reallocates for the extension, and registers the keys.
On whitelist mints, follow with an approval by the confidential-transfer authority.

```ts
import {
    createConfigureConfidentialAccountInstructionPlan,
    createApproveConfidentialAccountInstructionPlan,
    planConfidentialInstructions,
} from '@solana/mosaic-sdk/confidential';

const configurePlan = await createConfigureConfidentialAccountInstructionPlan({
    rpc,
    payer: feePayer,
    owner, // account owner signer
    mint: 'MintPubkey...',
    keys,
});

// Whitelist mints only: approve the configured account with the mint's authority.
const approvePlan = createApproveConfidentialAccountInstructionPlan({
    tokenAccount: 'OwnerAta...',
    mint: 'MintPubkey...',
    authority: confidentialTransferAuthority,
});
```

### 4. Deposit, apply, transfer, withdraw, empty

The standard confidential-balance lifecycle. All functions return an
`InstructionPlan` — see [Executing plans](#executing-plans) below.

```ts
import {
    createConfidentialDepositInstructionPlan,
    createApplyConfidentialPendingBalanceInstructionPlan,
    createConfidentialTransferInstructionPlan,
    createConfidentialWithdrawInstructionPlan,
    createEmptyConfidentialAccountInstructionPlan,
} from '@solana/mosaic-sdk/confidential';

// Move plaintext balance into the pending confidential balance (amount is public here).
const deposit = await createConfidentialDepositInstructionPlan({
    rpc,
    mint: 'MintPubkey...',
    tokenAccount: 'OwnerAta...',
    authority: owner,
    amount: 1000n,
});

// Roll the pending balance into the available confidential balance.
const apply = await createApplyConfidentialPendingBalanceInstructionPlan({
    rpc,
    tokenAccount: 'OwnerAta...',
    authority: owner,
    keys,
});

// Confidential transfer (auditor auto-detected from the mint unless overridden).
const transfer = await createConfidentialTransferInstructionPlan({
    rpc,
    payer: feePayer,
    mint: 'MintPubkey...',
    sourceToken: 'SenderAta...',
    destinationToken: 'RecipientAta...',
    authority: owner,
    amount: 400n,
    keys,
});

// Move confidential balance back to plaintext.
const withdraw = await createConfidentialWithdrawInstructionPlan({
    rpc,
    payer: feePayer,
    mint: 'MintPubkey...',
    tokenAccount: 'OwnerAta...',
    authority: owner,
    amount: 400n,
    keys,
});

// Zero out the available balance (withdraw first). Does not close the account.
const empty = await createEmptyConfidentialAccountInstructionPlan({
    rpc,
    payer: feePayer,
    tokenAccount: 'OwnerAta...',
    authority: owner,
    keys,
});
```

> **Transfer fees.** On a mint carrying `TransferFeeConfig` + `ConfidentialTransferFee`,
> `createConfidentialTransferInstructionPlan` routes itself to the fee-aware variant,
> which verifies five proofs instead of three and withholds the fee into the
> destination account. That path needs the current epoch to pick between the mint's
> older and newer fee schedule; it is read via `getEpochInfo` only on that path, and
> you can pass `currentEpoch` to skip the round trip. A mint with
> `ConfidentialTransferFee` but no `TransferFeeConfig` is malformed and is rejected
> before any proof is built.

### Credits (who may send you what)

Four proof-free toggles, each signed by the token account's owner, controlling
which kinds of incoming transfer the account accepts. Useful before `empty` /
account closure, and to park an account that should stop receiving.

```ts
import {
    createEnableConfidentialCreditsInstructionPlan,
    createDisableConfidentialCreditsInstructionPlan,
    createEnableNonConfidentialCreditsInstructionPlan,
    createDisableNonConfidentialCreditsInstructionPlan,
} from '@solana/mosaic-sdk/confidential';

// Stop accepting confidential transfers into this account.
const plan = createDisableConfidentialCreditsInstructionPlan({
    tokenAccount: 'OwnerAta...',
    authority: owner,
});
```

The `NonConfidential` pair governs incoming regular (plaintext) transfers instead. All four return a single-instruction `InstructionPlan`.

### Reading state before you ask for keys

Deriving keys costs a wallet signature, so a UI usually wants to know what it is
dealing with first. These readers are WASM-free and take an already-decoded mint or
token account, so they cost nothing beyond the fetch you were making anyway.

```ts
import {
    isConfidentialTransferMint,
    isConfidentialTransferAccount,
    mintHasConfidentialTransferFee,
    mintHasTransferFeeConfig,
    getConfidentialTransferAccountElgamalPubkey,
} from '@solana/mosaic-sdk/confidential';
import { fetchMint } from '@solana-program/token-2022';

const mint = await fetchMint(rpc, 'MintPubkey...');
if (isConfidentialTransferMint(mint)) {
    // ... offer the confidential flow
}
```

`assertConfidentialKeysMatchAccount(keys, registeredPubkey, label)` asserts that a caller's `ConfidentialKeys` are the ones a given account was actually registered with. The builders call it internally; call it yourself to fail early in a UI, before a wrong-wallet key surfaces as an opaque on-chain proof rejection.

For raw ciphertexts and their decryption there are `fetchConfidentialAccountState`
(the lower-level counterpart to `inspectConfidentialAccount`) plus
`decryptConfidentialBalances`, and the two primitives `decryptAesBalance` (fast and
exact, for a `decryptableAvailableBalance`) and `decryptElGamalBalance` (a discrete-log
search — only practical for small amounts).

`isSignerRejection` / `describeError` tell "the user dismissed the wallet prompt"
apart from "this wallet cannot sign the derivation message at all", which a UI has
to report differently.

### Amounts

Builders that take a user-facing amount accept a `TokenAmount` — a decimal string (`"1.5"`) or a raw `bigint`. To scale an amount yourself, use `tokenAmountToRaw(amount, decimals)`, which rejects non-numeric input, more fractional digits than the mint has decimals, and results outside `(0, 2^64)` — unlike the root `decimalAmountToRaw`, which silently truncates over-precision.

<a id="executing-plans"></a>

### Executing plans

Confidential operations return an `InstructionPlan` rather than a single
transaction (some span multiple transactions for proof context-state setup and
cleanup). Turn one into a signable `TransactionPlan` with `planConfidentialInstructions`,
then sign and send each transaction in order.

```ts
import { planConfidentialInstructions } from '@solana/mosaic-sdk/confidential';

const plan = await planConfidentialInstructions({ instructionPlan: transfer, feePayer });
// plan.kind === 'single' → one message; otherwise walk plan.plans in order,
// adding a fresh blockhash, signing, and sending each.
```

#### Transaction v1 (SIMD-0385)

Messages are packed as version-0 transactions by default. Pass `version: 1` to pack them as [SIMD-0385](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md) transactions instead, which raises the per-transaction budget from 1232 to 4096 bytes and therefore folds proof setup, the token instruction and cleanup into far fewer transactions — fewer signatures, fewer round trips, less context-state rent churn for the same operation.

```ts
const plan = await planConfidentialInstructions({ instructionPlan: transfer, feePayer, version: 1 });
```

The version is an option rather than a global switch because it is a wire-compatibility choice that belongs to you: version 1 needs Agave ≥ 4.2.2 on the RPC, and wallet and multisig support varies. The `txv1` feature gate is live on mainnet, devnet and testnet; legacy and version-0 transactions keep working unchanged.

> **Version 1 makes resource limits your responsibility.** Legacy and version-0 transactions fall back to the runtime default of 200k compute units per instruction when no limit is set. Version 1 has no such fallback: `computeUnitLimit` and `loadedAccountsDataSizeLimit` are header fields that **default to zero**, so a message sent without them is budgeted 0 CUs and 0 loaded-account bytes and fails on chain.
>
> The planner fills both with kit's _provisory_ value (`0`) while packing, so the fields occupy their real wire bytes and the size accounting is correct. Replacing them with real estimates is the send path's job:

```ts
import { estimateAndSetConfidentialResourceLimits } from '@solana/mosaic-sdk/confidential';

// Per transaction, after the lifetime is set and immediately before signing.
const withLimits = await estimateAndSetConfidentialResourceLimits({
    rpc,
    transactionMessage: setTransactionMessageLifetimeUsingBlockhash(blockhash, message),
});
const signed = await signTransactionMessageWithSigners(withLimits);
```

Do this per transaction as the plan progresses, not once over the whole plan up front: simulation needs a lifetime (planned messages deliberately have none), and a plan's later transactions read proof context-state accounts that its own earlier transactions create, so simulating them before those land fails on a missing account.

Two consequences for version 1 worth knowing:

- **`recordBackedProof` is a version-0 workaround.** It exists only because a version-0 range-proof transaction sits too close to 1232 bytes to also fit a compute-unit-limit _instruction_. Version 1 carries that limit in a header field and has 4096 bytes, so leave the option off — there it only adds transactions and rent churn.
- **No address lookup tables.** Version 1 inlines all accounts (max 64 accounts, 64 instructions, no duplicates). With 4096 raw bytes that is not a constraint for these flows, but "version 1" and "compressed via a lookup table" are mutually exclusive.

### Inspecting confidential accounts

Read (and, with keys, decrypt) an account's pending and available confidential balances.

```ts
import { inspectConfidentialAccount } from '@solana/mosaic-sdk/confidential';

const info = await inspectConfidentialAccount(rpc, 'OwnerAta...', keys);
console.log(info?.decrypted?.availableBalance); // bigint (raw units)
```

For a runnable end-to-end example of the transfer flow, see `packages/sdk/src/__tests__/integration/confidential.test.ts`.

> **Deprecated: `confidential/proof.ts`.** `buildProofVerificationIxs`,
> `buildTransferProofIxs`, `buildWithdrawProofIxs`, `buildPubkeyValidityProofIxs`,
> `buildZeroCiphertextProofIxs` and `buildCloseContextStateInstruction` are still
> exported, but no builder in this SDK constructs proofs by hand any more — every
> operation delegates to `@solana-program/token-2022/confidential`. They remain only
> for callers who wired their own flows on them, and are slated for removal in a
> future breaking release. They are also the only remaining way to reach the
> sibling/inline proof mode; the supported builders all use context-state proofs.

## Access lists (ABL, SRFC-37)

Create and manage allowlists/blocklists that gate who can thaw/hold tokens.

```ts
import {
    getCreateListTransaction,
    getAddWalletTransaction,
    getRemoveWalletTransaction,
    getList,
} from '@solana/mosaic-sdk';
import { generateKeyPairSigner } from '@solana/kit';

const authority = await generateKeyPairSigner();
const payer = authority;

// Create a list for a mint (Mode defaults to allowlist here; pass Mode.Block for blocklist)
const { transaction, listConfig } = await getCreateListTransaction({
    rpc,
    payer,
    authority,
    mint: 'MintPubkey...',
});

// Add/remove wallets
await getAddWalletTransaction({
    rpc,
    payer,
    authority,
    wallet: 'Wallet...',
    list: listConfig,
});
await getRemoveWalletTransaction({
    rpc,
    payer,
    authority,
    wallet: 'Wallet...',
    list: listConfig,
});

// Read list (config + all wallets)
const list = await getList({ rpc, listConfig });
```

## Token ACL operations

Enable permissionless thaw and perform freeze/thaw operations.

```ts
import {
    getCreateConfigTransaction,
    getEnablePermissionlessThawTransaction,
    getFreezeTransaction,
    getFreezeWalletTransaction,
    getThawTransaction,
    getThawPermissionlessTransaction,
} from '@solana/mosaic-sdk';
import { ABL_PROGRAM_ID } from '@solana/mosaic-sdk';

// One-time: create Token ACL mint config and set ABL as gating program (templates do this for single-signer flow)
await getCreateConfigTransaction({
    rpc,
    payer: feePayer,
    authority: feePayer,
    mint: 'MintPubkey...',
    gatingProgram: ABL_PROGRAM_ID,
});

// Enable permissionless thaw
await getEnablePermissionlessThawTransaction({
    rpc,
    payer: feePayer,
    authority: feePayer,
    mint: 'MintPubkey...',
});

// Authority-driven freeze/thaw
await getFreezeTransaction({
    rpc,
    payer: feePayer,
    authority: feePayer,
    tokenAccount: 'TokenAccountPubkey...',
});
// Freeze by owner wallet + mint. This creates the wallet ATA first if it does not exist.
await getFreezeWalletTransaction({
    rpc,
    payer: feePayer,
    authority: feePayer,
    wallet: 'WalletPubkey...',
    mint: 'MintPubkey...',
});
await getThawTransaction({
    rpc,
    payer: feePayer,
    authority: feePayer,
    tokenAccount: 'TokenAccountPubkey...',
});

// Anyone can thaw if permissionless thaw is enabled and ABL rules allow
await getThawPermissionlessTransaction({
    rpc,
    payer: feePayer,
    authority: feePayer, // payer signs the tx, thaw does not require freeze authority
    mint: 'MintPubkey...',
    tokenAccount: 'FrozenAta...',
    tokenAccountOwner: 'OwnerWallet...',
});
```

## Administration (authorities)

```ts
import { getUpdateAuthorityTransaction } from '@solana/mosaic-sdk';
import { AuthorityType } from '@solana-program/token-2022';

// Transfer freeze authority to a new address
await getUpdateAuthorityTransaction({
    rpc,
    payer: feePayer,
    mint: 'MintPubkey...',
    role: AuthorityType.FreezeAccount,
    currentAuthority: feePayer,
    newAuthority: 'NewFreezeAuthority...',
});

// Transfer metadata update authority
await getUpdateAuthorityTransaction({
    rpc,
    payer: feePayer,
    mint: 'MintPubkey...',
    role: 'Metadata',
    currentAuthority: feePayer,
    newAuthority: 'NewMetadataAuthority...',
});
```

## Utilities

```ts
import {
    resolveTokenAccount,
    getMintDecimals,
    decimalAmountToRaw,
    transactionToB64,
    transactionToB58,
} from '@solana/mosaic-sdk';

const { tokenAccount, isInitialized, isFrozen, balance, uiBalance } = await resolveTokenAccount(
    rpc,
    'WalletOrAta...',
    'Mint...',
);
const decimals = await getMintDecimals(rpc, 'Mint...');
const raw = decimalAmountToRaw(1.23, decimals);
// Encode a built transaction for transport/signing
const b64 = transactionToB64(tx);
const b58 = transactionToB58(tx);
```

## License

MIT

# @solana/mosaic-sdk

TypeScript SDK for building and operating Token-2022 mints with modern extensions. Batteries-included templates (Stablecoin, Arcade Token, Tokenized Security), and access-control management via Token ACL (SRFC-37). It is unopinionated about what kind of signer you use, whether that's a connected wallet, filesystem wallet, or 3rd party key management system.

## Key features

- **Templates**: One-call mint initialization for Stablecoin, Arcade Token, and Tokenized Security
- **Access control**: Create and manage allowlists/blocklists (ABL, SRFC-37 compliant)
- **Operations**: Mint, force-transfer (via permanent delegate), freeze/thaw, permissionless thaw (Token ACL)
- **Confidential balances**: Configure accounts, deposit/withdraw, confidential transfers, and confidential mint/burn with encrypted amounts (via the `@solana/mosaic-sdk/confidential` subpath)
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

The SDK supports the Token-2022 Confidential Transfer extension: token amounts are
encrypted on-chain (under a per-account ElGamal + AES key pair) while remaining
publicly auditable. On top of the standard flow (configure → deposit → apply →
transfer → withdraw → empty), the SDK also supports **confidential mint & burn**,
where new supply is minted straight into an encrypted balance and burned from it.

> **Import path.** Everything below imports from the dedicated
> `@solana/mosaic-sdk/confidential` subpath — _not_ the package root. This subpath
> pulls in the `@solana/zk-sdk` WASM proof/crypto dependency, which is deliberately
> kept out of the root barrel so plain (non-confidential) imports stay lightweight.
>
> **Cluster requirement.** Confidential operations verify zero-knowledge proofs via
> the ZK ElGamal Proof Program, which must be live on the target cluster (devnet and
> local validators; not always enabled on mainnet). Several operations span multiple
> transactions to set up and reclaim proof context-state accounts.
>
> **Memory.** `ConfidentialKeys` hold WASM-backed memory — call
> `freeConfidentialKeys(keys)` when you're done with them.
>
> **Amount cap.** Confidential mint and burn amounts are capped at `2^48 − 1` raw units.

### 1. Enable at mint creation

Use the `Token` builder to add the extension. `policy` is `'opt-in'` (accounts
self-configure) or `'whitelist'` (default — accounts must be approved by the
confidential-transfer authority before use).

```ts
import { Token } from '@solana/mosaic-sdk';
import { getConfidentialMintBurnInit, deriveConfidentialSupplyKeys } from '@solana/mosaic-sdk/confidential';

// Confidential balances + transfers only
const tx = await new Token()
    .withConfidentialBalances({ authority: mintAuthority.address, policy: 'opt-in' })
    .buildTransaction({ rpc, decimals: 2, mintAuthority, mint, feePayer });

// To also support confidential mint & burn, pair it with the ConfidentialMintBurn
// extension. Its init values come from the mint authority's supply keys, so derive
// those first and bake them into the mint.
const supplyKeys = await deriveConfidentialSupplyKeys({ signer: mintAuthority, mint: mint.address });
const tx2 = await new Token()
    .withConfidentialBalances({ authority: mintAuthority.address, policy: 'opt-in' })
    .withConfidentialMintBurn(getConfidentialMintBurnInit(supplyKeys))
    .buildTransaction({ rpc, decimals: 2, mintAuthority, mint, feePayer });
```

> **`withConfidentialMintBurn` forces a confidential-only supply.** A mint with the
> `ConfidentialMintBurn` extension tracks its total supply as an encrypted value, so
> Token-2022 **rejects plaintext `MintTo` / `Burn`** on it (`IllegalMintBurnConversion`).
> All issuance and redemption must go through `createConfidentialMintInstructionPlan` /
> `createConfidentialBurnInstructionPlan` (step 5) — the plaintext `createMintToTransaction`
> / `createBurnTransaction` builders fail fast on such a mint. Enable the extension only
> when you want the supply itself to be confidential. If you instead want a **public
> supply with confidential balances**, use `withConfidentialBalances` **without**
> `withConfidentialMintBurn`: mint in cleartext with `createMintToTransaction`, then move
> value into the confidential balance with a `deposit` (step 4).

### 2. Derive account keys

Each holder derives ElGamal + AES keys bound to `(owner, mint)` from a signature —
they are deterministic and never stored on-chain.

```ts
import { deriveConfidentialKeysForOwnerMint, freeConfidentialKeys } from '@solana/mosaic-sdk/confidential';

const keys = await deriveConfidentialKeysForOwnerMint({
    signer: owner, // a MessagePartialSigner (wallet / filesystem keypair)
    owner: owner.address,
    mint: 'MintPubkey...',
});
// ... use keys ...
freeConfidentialKeys(keys); // release WASM memory when done
```

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

### 5. Confidential mint & burn

Requires a mint created with both `withConfidentialBalances` and
`withConfidentialMintBurn` (see step 1). `supplyKeys` are the mint authority's
supply keys; `keys` are the holder's account keys.

```ts
import {
    createConfidentialMintInstructionPlan,
    createConfidentialBurnInstructionPlan,
    createApplyConfidentialPendingBurnInstructionPlan,
} from '@solana/mosaic-sdk/confidential';

// Mint straight into a confidential (pending) balance — amount never appears in cleartext.
const mint = await createConfidentialMintInstructionPlan({
    rpc,
    payer: feePayer,
    mint: 'MintPubkey...',
    destinationToken: 'OwnerAta...',
    authority: mintAuthority,
    amount: 500n,
    supplyKeys,
});

// Burn from the account's available confidential balance (authored by the owner).
const burn = await createConfidentialBurnInstructionPlan({
    rpc,
    payer: feePayer,
    mint: 'MintPubkey...',
    tokenAccount: 'OwnerAta...',
    authority: owner,
    amount: 200n,
    keys,
});

// Apply the mint's accumulated pending burn into its confidential supply (mint authority).
const applyBurn = createApplyConfidentialPendingBurnInstructionPlan({
    mint: 'MintPubkey...',
    authority: mintAuthority,
});
```

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

### Inspecting confidential accounts

Read (and, with keys, decrypt) an account's pending and available confidential balances.

```ts
import { inspectConfidentialAccount } from '@solana/mosaic-sdk/confidential';

const info = await inspectConfidentialAccount(rpc, 'OwnerAta...', keys);
console.log(info?.decrypted?.availableBalance); // bigint (raw units)
```

For a runnable end-to-end example (both the transfer flow and the mint/burn flow),
see `packages/sdk/src/__tests__/integration/confidential.test.ts`.

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

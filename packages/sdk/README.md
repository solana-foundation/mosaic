# @mosaic/sdk

TypeScript SDK for building and operating Token-2022 mints with modern extensions. Batteries-included templates (Stablecoin, Arcade Token, Tokenized Security), and access-control management via Token ACL (SRFC-37). It is unopinionated about what kind of signer you use, whether that's a connected wallet, filesystem wallet, or 3rd party key management system.

## Key features

- **Templates**: One-call mint initialization for Stablecoin, Arcade Token, and Tokenized Security
- **Access control**: Create and manage allowlists/blocklists (ABL, SRFC-37 compliant)
- **Operations**: Mint, force-transfer (via permanent delegate), freeze/thaw, permissionless thaw (Token ACL)
- **Authorities**: Update mint, freeze, metadata, and other authorities
- **Utilities**: Resolve ATAs, decimal math, transaction B64/B58 encoding

## Installation

```bash
pnpm add @mosaic/sdk
# or
npm i @mosaic/sdk
```

The SDK uses `@solana/kit` (RPC + SPL helpers) transitively; you can import helpers/types directly from `@solana/kit` in your app.

## Quick start

```ts
import { createStablecoinInitTransaction, transactionToB64 } from '@mosaic/sdk';
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
} from '@mosaic/sdk';
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

// Tokenized security (stablecoin extensions + Scaled UI Amount)
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
import { createMintToTransaction } from '@mosaic/sdk';
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
import { createForceTransferTransaction } from '@mosaic/sdk';

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

## Access lists (ABL, SRFC-37)

Create and manage allowlists/blocklists that gate who can thaw/hold tokens.

```ts
import { getCreateListTransaction, getAddWalletTransaction, getRemoveWalletTransaction, getList } from '@mosaic/sdk';
import { generateKeyPairSigner } from 'gill';

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
    getThawTransaction,
    getThawPermissionlessTransaction,
} from '@mosaic/sdk';
import { ABL_PROGRAM_ID } from '@mosaic/sdk';

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
import { getUpdateAuthorityTransaction } from '@mosaic/sdk';
import { AuthorityType } from 'gill/programs/token';

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
} from '@mosaic/sdk';

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

# @mosaic/tlv-account-resolution

TLV (Type-Length-Value) account resolution utilities for Solana Token-2022 transfer hooks and extra account metadata resolution.

## Overview

This package provides utilities for resolving extra account metadata in Solana programs, specifically designed for Token-2022 transfer hooks and complex instruction execution that requires dynamic account resolution. It implements the TLV (Type-Length-Value) encoding standard for flexible account metadata specification.

## Features

- = **Extra Account Resolution**: Resolve additional accounts required for Token-2022 transfer hooks
- =� **TLV Encoding Support**: Handle Type-Length-Value encoded account metadata
- <1 **Seed Resolution**: Support for Program Derived Address (PDA) seed resolution
- =� **Account Data Parsing**: Extract account information from instruction data and account states
- =� **Flexible Configuration**: Support multiple account resolution strategies
- =
  **Dynamic Discovery**: Runtime account discovery based on instruction context

## Installation

```bash
npm install @mosaic/tlv-account-resolution
# or
pnpm add @mosaic/tlv-account-resolution
```

## Quick Start

```typescript
import {
  resolveExtraMetas,
  getExtraAccountMetas,
  unpackExtraAccountMetas,
} from '@mosaic/tlv-account-resolution';
import type { Address, AccountMeta, MaybeEncodedAccount } from '@solana/kit';

// Account retriever function
const accountRetriever = async (
  address: Address
): Promise<MaybeEncodedAccount<string>> => {
  // Implement your account retrieval logic
  return await rpc.getAccount(address);
};

// Resolve extra account metas for a transfer hook
const extraMetas = await resolveExtraMetas(
  accountRetriever,
  extraMetasAddress, // Address containing extra account metadata
  previousMetas, // Previously resolved account metas
  instructionData, // Raw instruction data buffer
  programId // Program ID for PDA resolution
);
```

## Core Concepts

### Extra Account Metadata

Extra account metadata allows programs to specify additional accounts that should be included in instructions dynamically. This is essential for:

- **Transfer Hooks**: Token-2022 programs that need additional accounts during transfers
- **Dynamic PDAs**: Programs that derive addresses based on instruction context
- **Conditional Accounts**: Accounts that are only needed under certain conditions

### TLV Encoding

The package uses TLV (Type-Length-Value) encoding to store account metadata:

- **Type**: Discriminator indicating how to resolve the account
- **Length**: Size of the value data
- **Value**: The actual configuration data for account resolution

## API Reference

### Core Functions

#### `resolveExtraMetas()`

Main function to resolve all extra account metadata for an instruction.

```typescript
async function resolveExtraMetas(
  accountRetriever: (address: Address) => Promise<MaybeEncodedAccount<string>>,
  extraMetasAddress: Address,
  previousMetas: AccountMeta[],
  instructionData: Buffer,
  programId: Address
): Promise<AccountMeta[]>;
```

**Parameters:**

- `accountRetriever`: Function to fetch account data
- `extraMetasAddress`: Address containing the extra metadata
- `previousMetas`: Previously resolved account metas
- `instructionData`: Raw instruction data for context
- `programId`: Program ID for PDA derivation

**Returns:** Array of resolved `AccountMeta` objects

#### `getExtraAccountMetas()`

Extract extra account metadata from an account.

```typescript
function getExtraAccountMetas(
  account: MaybeEncodedAccount<string>
): ExtraAccountMeta[];
```

#### `unpackExtraAccountMetas()`

Parse raw account data into extra account metadata.

```typescript
function unpackExtraAccountMetas(data: Uint8Array): ExtraAccountMeta[];
```

### Account Resolution Types

#### Direct Address Resolution (Discriminator 0)

The simplest form - directly specifies an address.

```typescript
// Address is directly encoded in the configuration
const directAddress = getAddressDecoder().decode(addressConfig);
```

#### PDA Resolution (Discriminator 1)

Resolve a Program Derived Address using seeds.

```typescript
// Seeds are resolved and used to derive PDA
const seeds = await unpackSeeds(
  addressConfig,
  previousMetas,
  instructionData,
  accountRetriever
);
const [pda] = await getProgramDerivedAddress({
  programAddress: programId,
  seeds,
});
```

#### Pubkey Data Resolution (Discriminator 2)

Extract address from instruction data or account data.

```typescript
// Address extracted from instruction or account data
const address = await unpackPubkeyData(
  addressConfig,
  previousMetas,
  instructionData,
  accountRetriever
);
```

### Data Types

#### `ExtraAccountMeta`

Represents a single extra account metadata entry.

```typescript
interface ExtraAccountMeta {
  discriminator: number; // How to resolve the account
  addressConfig: Uint8Array; // Configuration data
  isSigner: boolean; // Whether account must sign
  isWritable: boolean; // Whether account is writable
}
```

#### `ExtraAccountMetaList`

Container for multiple extra account metadata entries.

```typescript
interface ExtraAccountMetaList {
  count: number;
  extraAccounts: ExtraAccountMeta[];
}
```

## Seed Resolution

The package supports various seed types for PDA resolution:

### Literal Seeds

Static byte sequences embedded in the configuration.

```typescript
// Fixed string or byte array
const seed = Buffer.from('my_seed', 'utf8');
```

### Instruction Data Seeds

Extract seeds from the instruction data at specific offsets.

```typescript
// Extract 8 bytes starting at offset 16 from instruction data
const seed = instructionData.slice(16, 24);
```

### Account Key Seeds

Use addresses from previously resolved accounts as seeds.

```typescript
// Use the address of a previously resolved account
const seed = getAddressEncoder().encode(previousMetas[accountIndex].address);
```

### Account Data Seeds

Extract seeds from account data at specific offsets.

```typescript
// Extract data from an account's data field
const accountData = await accountRetriever(accountAddress);
const seed = accountData.data.slice(offset, offset + length);
```

## Error Handling

The package provides specific error types for different failure scenarios:

```typescript
import {
  TokenTransferHookAccountNotFound,
  TokenTransferHookInvalidPubkeyData,
  TokenTransferHookAccountDataNotFound,
  TokenTransferHookInvalidSeed,
  TokenTransferHookPubkeyDataTooSmall,
} from '@mosaic/tlv-account-resolution';

try {
  const metas = await resolveExtraMetas(/* ... */);
} catch (error) {
  if (error instanceof TokenTransferHookAccountNotFound) {
    console.error('Required account not found');
  } else if (error instanceof TokenTransferHookInvalidPubkeyData) {
    console.error('Invalid pubkey data format');
  }
  // Handle other error types...
}
```

## Usage Examples

### Transfer Hook Integration

```typescript
import { resolveExtraMetas } from '@mosaic/tlv-account-resolution';

// Resolve extra accounts for a token transfer with hooks
async function buildTransferWithHooks(
  transferInstruction: TransactionInstruction,
  extraMetasAddress: Address,
  programId: Address
) {
  const accountRetriever = async (address: Address) => {
    return await connection.getAccount(address);
  };

  const extraMetas = await resolveExtraMetas(
    accountRetriever,
    extraMetasAddress,
    transferInstruction.accounts,
    Buffer.from(transferInstruction.data),
    programId
  );

  // Add resolved accounts to the instruction
  transferInstruction.accounts.push(...extraMetas);

  return transferInstruction;
}
```

### Custom Program Integration

```typescript
// Resolve accounts for a custom program that uses extra metas
async function resolveCustomProgramAccounts(
  programId: Address,
  instructionData: Buffer,
  baseAccounts: AccountMeta[]
) {
  // Find the extra metas address (program-specific logic)
  const extraMetasAddress = await findExtraMetasAddress(programId);

  const resolvedMetas = await resolveExtraMetas(
    accountRetriever,
    extraMetasAddress,
    baseAccounts,
    instructionData,
    programId
  );

  return [...baseAccounts, ...resolvedMetas];
}
```

## Architecture

```
src/
   index.ts           # Main exports
   state.ts          # Core resolution logic
   seeds.ts          # Seed resolution utilities
   pubkeyData.ts     # Pubkey data extraction
   errors.ts         # Error definitions
```

## Performance Considerations

1. **Account Caching**: Consider caching account data to reduce RPC calls
2. **Batch Retrieval**: Implement batch account retrieval for better performance
3. **Error Recovery**: Implement retry logic for network failures
4. **Validation**: Validate account data before processing to avoid errors

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Run tests
pnpm test

# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with comprehensive tests
4. Update documentation
5. Submit a pull request

## License

MIT - see LICENSE file for details

## Resources

- [Token-2022 Transfer Hook Guide](https://solana.com/developers/guides/token-extensions/transfer-hook)
- [Solana Account Model](https://docs.solana.com/developing/programming-model/accounts)
- [Program Derived Addresses](https://docs.solana.com/developing/programming-model/calling-between-programs#program-derived-addresses)
- [TLV Encoding](https://en.wikipedia.org/wiki/Type-length-value)

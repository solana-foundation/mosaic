# @mosaic/ebalts

Token ACL (Access Control Lists for Solana Tokens). This standard provides management of access control lists for Solana Tokens, enabling advanced Token-2022 freeze/thaw functionality with programmable access control.

## Overview

Token ACL provides enhanced balance and transfer security features for Token-2022 tokens, enabling sophisticated freeze/thaw mechanisms with programmable gating through external programs. This package is essential for implementing complex access control patterns that go beyond simple authority-based freezing.

## Features

- **Enhanced Freeze Control**: Advanced freeze/thaw mechanisms beyond standard Token-2022
- **Programmable Gating**: Integration with external programs for dynamic access control
- **Permissionless Operations**: Allow certain operations without explicit authority signatures
- **Security Extensions**: Additional security layers for token operations
- **Mint Configuration**: Flexible configuration per token mint
- **Authority Management**: Granular authority control for different operations

## Installation

```bash
npm install @mosaic/ebalts
# or
pnpm add @mosaic/ebalts
```

## Quick Start

```typescript
import {
  getCreateConfigInstructionAsync,
  getSetGatingProgramInstructionAsync,
  getFreezeInstructionAsync,
  getThawInstructionAsync,
  getTogglePermissionlessInstructionsInstructionAsync,
} from '@mosaic/ebalts';
import { generateKeyPairSigner } from '@solana/kit';

// Create Token ACL configuration for a mint
const authority = await generateKeyPairSigner();
const mint = 'YourMintAddress...';

const createConfigInstruction = await getCreateConfigInstructionAsync({
  authority: authority.address,
  mint,
  payer: authority.address,
});

// Set gating program (e.g., ABL program for allowlist/blocklist)
const gatingProgram = 'GatingProgramAddress...';
const setGatingInstruction = await getSetGatingProgramInstructionAsync({
  authority: authority.address,
  mint,
  gatingProgram,
});
```

## Core Concepts

### Mint Configuration

Each token mint can have a Token ACL configuration that defines:

- **Freeze Authority**: Who can freeze/thaw accounts
- **Gating Program**: External program that validates operations
- **Permissionless Settings**: Which operations can be performed without authority

```typescript
type MintConfig = {
  discriminator: number;
  mint: Address;
  freezeAuthority: Address;
  gatingProgram: Address;
  bump: number;
  enablePermissionlessThaw: boolean;
  enablePermissionlessFreeze: boolean;
};
```

### Gating Programs

Token ACL integrates with external programs to provide dynamic access control:

- **ABL Integration**: Use address-based lists for allowlist/blocklist functionality
- **Custom Programs**: Implement custom logic for access control
- **Dynamic Validation**: Programs can validate operations based on current state

## API Reference

### Configuration Management

#### `getCreateConfigInstructionAsync()`

Create a Token ACL configuration for a mint.

```typescript
const instruction = await getCreateConfigInstructionAsync({
  authority: Address, // Authority that manages the configuration
  mint: Address, // Token mint address
  payer: Address, // Transaction payer
});
```

#### `getSetGatingProgramInstructionAsync()`

Set or update the gating program for a mint.

```typescript
const instruction = await getSetGatingProgramInstructionAsync({
  authority: Address, // Configuration authority
  mint: Address, // Token mint address
  gatingProgram: Address, // Program that will gate operations
});
```

#### `getSetAuthorityInstructionAsync()`

Transfer authority for the Token ACL configuration.

```typescript
const instruction = await getSetAuthorityInstructionAsync({
  authority: Address, // Current authority
  mint: Address, // Token mint address
  newAuthority: Address, // New authority address
});
```

### Freeze/Thaw Operations

#### `getFreezeInstructionAsync()`

Freeze a token account using Token ACL authority.

```typescript
const instruction = await getFreezeInstructionAsync({
  authority: TransactionSigner, // Freeze authority
  tokenAccount: Address, // Account to freeze
  mint: Address, // Token mint
  mintConfig: Address, // EBALTS configuration
  tokenAccountOwner: Address, // Owner of the token account
});
```

#### `getThawInstructionAsync()`

Thaw a frozen token account using Token ACL authority.

```typescript
const instruction = await getThawInstructionAsync({
  authority: TransactionSigner, // Thaw authority
  tokenAccount: Address, // Account to thaw
  mint: Address, // Token mint
  mintConfig: Address, // Token ACL configuration
  tokenAccountOwner: Address, // Owner of the token account
});
```

### Permissionless Operations

#### `getFreezePermissionlessInstructionAsync()`

Freeze an account without authority signature (if enabled).

```typescript
const instruction = await getFreezePermissionlessInstructionAsync({
  authority: Address, // Authority address (no signature required)
  tokenAccount: Address, // Account to freeze
  mint: Address, // Token mint
  mintConfig: Address, // Token ACL configuration
  tokenAccountOwner: Address, // Owner of the token account
  gatingProgram: Address, // Gating program address
});
```

#### `getThawPermissionlessInstructionAsync()`

Thaw an account without authority signature (if enabled).

```typescript
const instruction = await getThawPermissionlessInstructionAsync({
  authority: Address, // Authority address (no signature required)
  tokenAccount: Address, // Account to thaw
  mint: Address, // Token mint
  mintConfig: Address, // Token ACL configuration
  tokenAccountOwner: Address, // Owner of the token account
  gatingProgram: Address, // Gating program address
});
```

#### `getTogglePermissionlessInstructionsInstructionAsync()`

Enable or disable permissionless operations.

```typescript
const instruction = await getTogglePermissionlessInstructionsInstructionAsync({
  authority: Address, // Configuration authority
  mint: Address, // Token mint
  enablePermissionlessThaw: boolean, // Enable/disable permissionless thaw
  enablePermissionlessFreeze: boolean, // Enable/disable permissionless freeze
});
```

### Utility Functions

#### `findMintConfigPda()`

Find the Program Derived Address for a mint configuration.

```typescript
const mintConfigPda = await findMintConfigPda({
  mint: mintAddress,
});
```

#### `createThawPermissionlessInstructionWithExtraMetas()`

Create a permissionless thaw instruction with resolved extra account meta.

```typescript
const instruction = await createThawPermissionlessInstructionWithExtraMetas(
  authority,
  tokenAccount,
  mint,
  mintConfig,
  tokenAccountOwner,
  programAddress,
  accountRetriever
);
```

## Integration Examples

### With ABL (Address-Based Lists)

```typescript
import { Mode } from '@mosaic/abl';
import {
  getCreateConfigInstructionAsync,
  getSetGatingProgramInstructionAsync,
} from '@mosaic/ebalts';

// Setup Token ACL with ABL integration
const instructions = [
  // Create EBALTS config
  await getCreateConfigInstructionAsync({
    authority: authority.address,
    mint: mintAddress,
    payer: authority.address,
  }),

  // Set ABL as gating program
  await getSetGatingProgramInstructionAsync({
    authority: authority.address,
    mint: mintAddress,
    gatingProgram: ABL_PROGRAM_ID,
  }),

  // Enable permissionless thaw for user-friendly experience
  await getTogglePermissionlessInstructionsInstructionAsync({
    authority: authority.address,
    mint: mintAddress,
    enablePermissionlessThaw: true,
    enablePermissionlessFreeze: false,
  }),
];
```

### Gaming Token Example

```typescript
// Configure Token ACL for an arcade token
const setupInstructions = [
  // Create configuration
  await getCreateConfigInstructionAsync({
    authority: gameAuthority.address,
    mint: arcadeTokenMint,
    payer: gameAuthority.address,
  }),

  // Set game program as gating authority
  await getSetGatingProgramInstructionAsync({
    authority: gameAuthority.address,
    mint: arcadeTokenMint,
    gatingProgram: gameProgram,
  }),

  // Enable permissionless operations for smooth gameplay
  await getTogglePermissionlessInstructionsInstructionAsync({
    authority: gameAuthority.address,
    mint: arcadeTokenMint,
    enablePermissionlessThaw: true,
    enablePermissionlessFreeze: true,
  }),
];
```

## Program Information

- **Program ID**: TBD (To Be Determined - check generated files)
- **Account Types**: MintConfig, ExtraMetasAccount
- **Integration**: Designed for Token-2022 and SRFC-37 compatibility

## Architecture

```
src/
   generated/           # Auto-generated code from IDL
      accounts/       # Account type definitions
         mintConfig.ts
      instructions/   # Instruction builders
         createConfig.ts
         freeze.ts
         thaw.ts
         setGatingProgram.ts
         ...
      pdas/          # Program Derived Address utilities
      programs/      # Program definitions
   index.ts          # Main exports and utility functions
```

## Error Handling

Common errors and their meanings:

- **MintConfigNotFound**: Token ACL configuration doesn't exist for the mint
- **InvalidAuthority**: Provided authority doesn't match configuration
- **GatingProgramRejection**: External gating program rejected the operation
- **PermissionlessDisabled**: Attempting permissionless operation when disabled
- **InvalidTokenAccount**: Token account is invalid or doesn't exist

## Best Practices

1. **Authority Security**: Keep freeze authorities secure, consider multisig
2. **Gating Program Integration**: Ensure gating programs are well-tested
3. **Permissionless Settings**: Carefully consider security implications
4. **Account Resolution**: Use proper account resolution for extra metas
5. **Error Handling**: Implement comprehensive error handling for gating rejections

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

# Regenerate from IDL (if needed)
npx codama idl/ebalts.json
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with proper testing
4. Update documentation
5. Submit a pull request

## License

MIT - see LICENSE file for details

## Resources

- [Token-2022 Extensions Guide](https://solana.com/developers/guides/token-extensions)
- [SRFC-37 Address-Based Lists](https://github.com/solana-foundation/solana-rfcs/blob/main/text/0037-address-based-lists.md)
- [Solana Program Library](https://github.com/solana-program/)

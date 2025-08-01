# @mosaic/cli

Command-line interface for managing Token-2022 tokens with extensions on Solana.

## Features

- 🪙 **Token Creation**: Create stablecoins and arcade tokens with proper Token-2022 extensions
- 🔧 **Token Management**: Mint, transfer, freeze/thaw, and manage token operations
- 📋 **Access Control**: Manage allowlists and blocklists with SRFC-37 compliance
- 🛡️ **Extensions Support**: Full support for Token-2022 extensions (EBALTS, ABL)
- 🎨 **Rich Output**: Colorful terminal output with loading indicators
- 🔗 **Flexible Configuration**: Support for custom RPC URLs and keypairs

## Installation

```bash
# Install globally
npm install -g @mosaic/cli

# Or use with pnpm in the monorepo
pnpm install
```

## Global Options

All commands support these global options:

```bash
--rpc-url <url>     # Solana RPC URL (default: https://api.devnet.solana.com)
--keypair <path>    # Path to keypair file (defaults to Solana CLI default)
```

## Commands

### Token Creation

#### Create Stablecoin

Create a regulatory-compliant stablecoin with blocklist functionality:

```bash
mosaic create stablecoin \
  --name "USD Coin" \
  --symbol "USDC" \
  --decimals 6 \
  --uri "https://example.com/metadata.json" \
  --mint-authority <address> \
  --metadata-authority <address> \
  --pausable-authority <address> \
  --confidential-balances-authority <address> \
  --permanent-delegate-authority <address>
```

**Extensions included:**
- Default Account State (blocklist mode)
- Metadata
- Confidential Balances
- Pausable
- Permanent Delegate

#### Create Arcade Token

Create a gaming-optimized token with allowlist functionality:

```bash
mosaic create arcade-token \
  --name "Game Points" \
  --symbol "POINTS" \
  --decimals 0 \
  --uri "https://example.com/game-metadata.json" \
  --mint-authority <address> \
  --metadata-authority <address> \
  --pausable-authority <address> \
  --permanent-delegate-authority <address>
```

**Extensions included:**
- Default Account State (allowlist mode)
- Metadata
- Permanent Delegate
- Pausable

### Token Management

#### Mint Tokens

```bash
mosaic mint <mint-address> <amount> <recipient-address>
```

#### Transfer Tokens

```bash
mosaic transfer <from-address> <to-address> <amount> <mint-address>
```

#### Force Transfer

Transfer tokens using permanent delegate authority:

```bash
mosaic force-transfer <from-address> <to-address> <amount> <mint-address>
```

#### Inspect Mint

Get detailed information about a token mint:

```bash
mosaic inspect-mint <mint-address>
```

### Access List Management

#### Allowlist Commands

```bash
# Add addresses to allowlist
mosaic allowlist add <mint-address> <address1> [address2] [address3]...

# Remove addresses from allowlist
mosaic allowlist remove <mint-address> <address1> [address2] [address3]...
```

#### Blocklist Commands

```bash
# Add addresses to blocklist
mosaic blocklist add <mint-address> <address1> [address2] [address3]...

# Remove addresses from blocklist
mosaic blocklist remove <mint-address> <address1> [address2] [address3]...
```

### Extension Management

#### EBALTS (Enhanced Balance and Transfer Security)

```bash
# Create EBALTS configuration
mosaic ebalts create-config <mint-address>

# Enable permissionless thaw
mosaic ebalts enable-permissionless-thaw <mint-address>

# Set gating program
mosaic ebalts set-gating-program <mint-address> <program-id>

# Freeze account
mosaic ebalts freeze <mint-address> <account-address>

# Thaw account
mosaic ebalts thaw <mint-address> <account-address>

# Permissionless thaw
mosaic ebalts thaw-permissionless <mint-address> <account-address>
```

#### ABL (Address-Based Lists)

```bash
# Create access list
mosaic abl create-list <mint-address> <mode>

# Fetch list information
mosaic abl fetch-list <list-address>

# Fetch all lists
mosaic abl fetch-lists

# Set extra metas
mosaic abl set-extra-metas <mint-address> <list-address>
```

## Examples

### Creating a Stablecoin

```bash
# Create a new stablecoin on devnet
mosaic create stablecoin \
  --name "My Stable Coin" \
  --symbol "MSC" \
  --decimals 6 \
  --uri "https://mysite.com/metadata.json" \
  --rpc-url https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

### Managing Access Lists

```bash
# Add addresses to blocklist for a stablecoin
mosaic blocklist add 7xKSh...mint... \
  9WzDXw...addr1... \
  5uQnKp...addr2... \
  --rpc-url https://api.devnet.solana.com

# Remove address from allowlist for arcade token
mosaic allowlist remove 4tNm2K...mint... 9WzDXw...addr... 
```

### Minting and Transferring

```bash
# Mint 1000 tokens to recipient
mosaic mint 7xKSh...mint... 1000 9WzDXw...recipient...

# Transfer 100 tokens
mosaic transfer 9WzDXw...from... 5uQnKp...to... 100 7xKSh...mint...
```

## Architecture

```
src/
├── commands/
│   ├── create/              # Token creation commands
│   │   ├── stablecoin.ts   # Stablecoin creation
│   │   └── arcade-token.ts # Arcade token creation
│   ├── allowlist/          # Allowlist management
│   ├── blocklist/          # Blocklist management
│   ├── ebalts/            # EBALTS extension commands
│   ├── abl/               # ABL extension commands
│   ├── mint.ts            # Mint command
│   ├── transfer.ts        # Transfer command
│   ├── force-transfer.ts  # Force transfer command
│   └── inspect-mint.ts    # Mint inspection
├── utils/                 # Utility functions
│   ├── rpc.ts            # RPC client utilities
│   └── solana.ts         # Solana utilities
└── index.ts              # Main CLI entry point
```

## Development

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Run in development mode
pnpm dev

# Run built CLI
pnpm start

# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix
```

## Dependencies

- **@mosaic/sdk**: Token templates and core functionality
- **commander**: CLI framework for command parsing
- **chalk**: Terminal string styling with colors
- **ora**: Elegant terminal spinners
- **gill**: Solana RPC client and utilities
- **bs58**: Base58 encoding for Solana addresses

## Configuration

The CLI uses the following configuration sources in order of precedence:

1. Command-line options (`--rpc-url`, `--keypair`)
2. Solana CLI configuration (`~/.config/solana/cli/config.yml`)
3. Default values (devnet RPC, default keypair location)

## Error Handling

The CLI provides comprehensive error handling with:

- Clear error messages for common issues
- Validation of Solana addresses and amounts
- Network connectivity checks
- Transaction confirmation status

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes with proper error handling
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

## License

MIT - see LICENSE file for details

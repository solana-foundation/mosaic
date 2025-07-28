# @mosaic/cli

Command-line interface for managing Token-2022 tokens with extensions.

## Purpose

A comprehensive CLI tool for creating and managing Token-2022 tokens with various extensions:

- 🖥️ **Command Line Interface**: Easy-to-use commands for token operations
- 🪙 **Token Creation**: Create stablecoins and arcade tokens with proper extensions
- 🔧 **Token Management**: Mint, transfer, freeze, pause, and manage tokens
- 📋 **SRFC Management**: Manage allowlists and blocklists
- 🔍 **Token Information**: Query token details and extension states

## Planned Commands

### Token Creation

```bash
# Create a stablecoin with blocklist
mosaic create stablecoin --name "USD Coin" --symbol "USDC" --decimals 6

# Create an arcade token with allowlist
mosaic create arcade-token --name "Game Points" --symbol "POINTS" --decimals 0
```

### Token Management

```bash
# Mint tokens
mosaic mint <mint-address> <recipient> <amount>

# Transfer tokens
mosaic transfer <mint-address> <from> <to> <amount>

# Freeze/thaw accounts
mosaic freeze <mint-address> <account>
mosaic thaw <mint-address> <account>

# Pause/unpause token
mosaic pause <mint-address>
mosaic unpause <mint-address>
```

### SRFC List Management

```bash
# Add addresses to allowlist/blocklist
mosaic allowlist add <mint-address> <address1> <address2>
mosaic blocklist add <mint-address> <address1> <address2>

# Remove addresses from lists
mosaic allowlist remove <mint-address> <address>
mosaic blocklist remove <mint-address> <address>

# View lists
mosaic allowlist view <mint-address>
mosaic blocklist view <mint-address>
```

### Information Commands

```bash
# Get token information
mosaic info <mint-address>

# List all tokens
mosaic list

# Get account information
mosaic account <account-address>
```

## Architecture

```
cli/
├── src/
│   ├── commands/        # CLI command implementations
│   │   ├── create/     # Token creation commands
│   │   ├── manage/     # Token management commands
│   │   ├── srfc/       # SRFC list management
│   │   └── info/       # Information commands
│   ├── utils/          # CLI utilities
│   └── index.ts        # Main CLI entry point
├── bin/                # Executable files
└── templates/          # Command templates
```

## Dependencies

- `@mosaic/sdk` - Token templates and functionality
- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `chalk` - Terminal colors
- `ora` - Loading spinners

## Development Status

⚠️ **Planned** - This CLI will provide:

- Interactive token creation workflows
- Comprehensive token management commands
- SRFC allowlist/blocklist management
- Rich terminal output with colors and progress indicators

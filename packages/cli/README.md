# @mosaic/cli

CLI for building and operating Token-2022 mints with modern extensions on Solana. Pairs with `@mosaic/sdk` and uses your filesystem keypair or the Solana CLI config by default.

## Features

- **Templates**: Create Stablecoin, Arcade Token, and Tokenized Security mints
- **Operations**: Mint, transfer, force-transfer (permanent delegate), inspect mints
- **Access control**: Manage allowlists/blocklists
- **Token ACL**: Create config, set gating program, enable permissionless thaw, thaw/freeze

## Installation

```bash
# inside this monorepo
pnpm i && pnpm -w build
```

## Global options

Note that all commands expect the fee payer to be the authority for the action executed. All commands accept:

```bash
--rpc-url <url>    # RPC endpoint (default: https://api.devnet.solana.com or Solana CLI config)
--keypair <path>   # Path to keypair JSON (default: Solana CLI keypair path)
```

## Quick start

```bash
# Create a stablecoin (blocklist by default)
mosaic create stablecoin \
  --name "USD Token" \
  --symbol "USDtoken" \
  --decimals 6 \
  --uri https://example.com/usdtoken.json

# Mint to a recipient (ATA auto-creation; permissionless thaw if needed)
mosaic mint \
  --mint-address <MINT> \
  --recipient <RECIPIENT_WALLET> \
  --amount 10.5
```

### Note on templates and side-effects

If your signer (fee payer) is also the mint authority, the create commands will additionally:

- create Token ACL config and set gating program to the ABL program
- create an ABL list (allowlist for Arcade, configurable for Stablecoin and Tokenized Security)
- set ABL extra metas on the mint
- enable Token ACL permissionless thaw

## Command reference

### Create

```bash
# Stablecoin (metadata, pausable, confidential balances, permanent delegate)
mosaic create stablecoin \
  --name <name> \
  --symbol <symbol> \
  [--decimals <number=6>] \
  [--uri <uri>] \
  [--mint-authority <address>] \
  [--metadata-authority <address>] \
  [--pausable-authority <address>] \
  [--confidential-balances-authority <address>] \
  [--permanent-delegate-authority <address>] \
  [--mint-keypair <path>]

# Arcade Token (metadata, pausable, permanent delegate, allowlist)
mosaic create arcade-token \
  --name <name> \
  --symbol <symbol> \
  [--decimals <number=0>] \
  [--uri <uri>] \
  [--mint-authority <address>] \
  [--metadata-authority <address>] \
  [--pausable-authority <address>] \
  [--permanent-delegate-authority <address>] \
  [--mint-keypair <path>]

# Tokenized Security (stablecoin set + Scaled UI Amount)
mosaic create tokenized-security \
  --name <name> \
  --symbol <symbol> \
  [--decimals <number=6>] \
  [--uri <uri>] \
  [--acl-mode <allowlist|blocklist>]
  [--mint-authority <address>] \
  [--metadata-authority <address>] \
  [--pausable-authority <address>] \
  [--confidential-balances-authority <address>] \
  [--permanent-delegate-authority <address>] \
  [--multiplier <number=1>] \
  [--scaled-ui-amount-authority <address>] \
  [--mint-keypair <path>]
```

### Token management

```bash
# Mint tokens to a recipient wallet (ATA auto-create)
mosaic mint \
  --mint-address <mint> \
  --recipient <wallet> \
  --amount <decimal>

# Transfer tokens (optional memo)
mosaic transfer \
  --mint-address <mint> \
  --recipient <wallet> \
  --amount <decimal> \
  [--memo <text>]

# Force transfer using permanent delegate authority
mosaic force-transfer \
  --mint-address <mint> \
  --from-account <wallet_or_ata> \
  --recipient <wallet_or_ata> \
  --amount <decimal>

# Inspect a mint and list extensions
mosaic inspect-mint --mint-address <mint>
```

### ABL (Address-Based Lists)

```bash
# Create a list for a mint (authority = signer)
mosaic abl create-list --mint <mint>

# Set ABL extra metas on a mint (associate list with mint)
mosaic abl set-extra-metas --mint <mint> --list <list_address>

# Fetch a specific list
mosaic abl fetch-list --list <list_address>

# Fetch all lists
mosaic abl fetch-lists

# Allowlist: add/remove wallet addresses
mosaic allowlist add --mint-address <mint> --account <wallet>
mosaic allowlist remove --mint-address <mint> --account <wallet>

# Blocklist: add/remove wallet addresses
mosaic blocklist add --mint-address <mint> --account <wallet>
mosaic blocklist remove --mint-address <mint> --account <wallet>
```

### Token ACL (Access Control Lists for Solana Tokens)

```bash
# Create Token ACL config for a mint (supply gating program; use ABL program for ABL gating)
mosaic ebalts create --mint <mint> [--gating-program <address>]

# Set/Update the gating program
mosaic ebalts set-gating-program --mint <mint> --gating-program <address>

# Enable permissionless thaw on a mint
mosaic ebalts enable-permissionless-thaw --mint <mint>

# Thaw a frozen token account (authority required)
mosaic ebalts thaw --token-account <ata>

# Permissionless thaw for your own ATA (if enabled)
mosaic ebalts thaw-permissionless --mint <mint>
```

## Configuration and keys

- Uses `--rpc-url` and `--keypair` when provided.
- Otherwise reads `~/.config/solana/cli/config.yml` for `json_rpc_url` and `keypair_path`.
- Defaults to Devnet and the Solana CLI default keypair if nothing is set.

## Examples

```bash
# Arcade token with allowlist and custom authorities
mosaic create arcade-token \
  --name "Points" \
  --symbol PTS \
  --decimals 0 \
  --mint-authority <AUTH> \
  --metadata-authority <AUTH> \
  --pausable-authority <AUTH> \
  --permanent-delegate-authority <AUTH>

# Add a wallet to an allowlist
mosaic allowlist add --mint-address <MINT> --account <WALLET>

# Enable permissionless thaw for a mint
mosaic ebalts enable-permissionless-thaw --mint <MINT>
```

## Development

```bash
pnpm i
pnpm build
pnpm dev        # tsx src/index.ts
pnpm start      # node dist/index.js
pnpm type-check
pnpm lint && pnpm lint:fix
```

## Notes

- This CLI uses `gill` under the hood for RPC and SPL helpers.
- Command output includes addresses and signatures suitable for copy/paste.

## License

MIT

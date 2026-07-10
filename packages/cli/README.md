# @solana/mosaic-cli

CLI for building and operating Token-2022 mints with modern extensions on Solana. Pairs with `@solana/mosaic-sdk` and uses your filesystem keypair or the Solana CLI config by default.

## Features

- **Templates**: Create Stablecoin, Arcade Token, and Tokenized Security mints
- **Operations**: Mint, transfer, force-transfer (permanent delegate), inspect mints
- **Access control**: Manage allowlists/blocklists
- **Token ACL**: Create config, set gating program, enable permissionless thaw, thaw/freeze
- **Confidential balances**: Configure accounts, deposit/apply/withdraw, confidential transfer, confidential mint/burn, and inspect encrypted state

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

> **Confidential balances.** Confidential balances are enabled at mint creation and
> operated at runtime through the [`mosaic confidential`](#confidential-balances)
> command group (configure account, deposit/apply/withdraw, confidential transfer,
> confidential mint/burn, inspect). For the underlying primitives see the
> [SDK confidential guide](../sdk/README.md#confidential-balances--transfers).

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
  [--confidential-policy <opt-in|whitelist>] \
  [--auditor-elgamal-pubkey <address>] \
  [--confidential-mint-burn] \
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

# Tokenized Security (stablecoin set + Permissioned Burn + Scaled UI Amount)
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
  [--confidential-policy <opt-in|whitelist>] \
  [--auditor-elgamal-pubkey <address>] \
  [--confidential-mint-burn] \
  [--permanent-delegate-authority <address>] \
  [--permissioned-burn-authority <address>] \
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

# Burn tokens from the signer wallet. On permissioned burn mints the burn
# authority must co-sign; pass its keypair if it differs from the signer.
mosaic burn \
  --mint-address <mint> \
  --amount <decimal> \
  [--permissioned-burn-keypair <path>]

# Force burn using permanent delegate authority
mosaic force-burn \
  --mint-address <mint> \
  --from-account <wallet_or_ata> \
  --amount <decimal> \
  [--permissioned-burn-keypair <path>]

# Inspect a mint and list extensions
mosaic inspect-mint --mint-address <mint>
```

The `create stablecoin` and `create tokenized-security` commands accept confidential-transfer flags:

- `--confidential-policy <opt-in|whitelist>` — enable policy for confidential transfers (default `whitelist`).
- `--auditor-elgamal-pubkey <address>` — optional auditor ElGamal public key.
- `--confidential-mint-burn` — also enable the `ConfidentialMintBurn` extension (mint/burn directly into/from confidential balances). Derives the mint authority's supply keys, so the signer must be the mint authority and it cannot run in `--raw-tx` mode.

### Confidential balances

Runtime operations for Token-2022 confidential balances. Operations that derive
confidential keys need the account owner's (or mint authority's) real keypair and
cannot run in `--raw-tx` mode. Multi-transaction proof flows (configure, transfer,
withdraw, mint, burn) are sent one transaction at a time. All commands accept
`-m, --mint` and default `--token-account` to the signer's ATA.

```bash
# Configure (create/reallocate) a token account for confidential transfers
mosaic confidential configure-account \
  --mint <mint> \
  [--token-account <address>] \
  [--max-pending-credits <number>]

# Approve a configured account (whitelist-policy mints)
mosaic confidential approve --mint <mint> [--token-account <address>]

# Enable / disable incoming credits (--non-confidential toggles plaintext credits)
mosaic confidential enable-credits  --mint <mint> [--token-account <address>] [--non-confidential]
mosaic confidential disable-credits --mint <mint> [--token-account <address>] [--non-confidential]

# Deposit plaintext balance -> pending confidential balance
mosaic confidential deposit --mint <mint> --amount <decimal> [--token-account <address>]

# Apply pending -> available confidential balance
mosaic confidential apply --mint <mint> [--token-account <address>]

# Withdraw available confidential balance -> plaintext balance
mosaic confidential withdraw --mint <mint> --amount <decimal> [--token-account <address>]

# Confidentially transfer to another confidential account (auto-detects the mint auditor)
mosaic confidential transfer \
  --mint <mint> \
  --to <recipient_owner> \
  --amount <decimal> \
  [--token-account <address>] \
  [--to-token-account <address>] \
  [--auditor-elgamal-pubkey <address>]

# Confidentially mint into a confidential balance (mint must carry ConfidentialMintBurn; mint authority)
mosaic confidential mint \
  --mint <mint> \
  --amount <decimal> \
  --to <recipient_owner> \
  [--to-token-account <address>] \
  [--auditor-elgamal-pubkey <address>]

# Confidentially burn from a confidential balance (account owner)
mosaic confidential burn \
  --mint <mint> \
  --amount <decimal> \
  [--token-account <address>] \
  [--auditor-elgamal-pubkey <address>]

# Apply the mint's accumulated pending burn into its confidential supply (mint authority)
mosaic confidential apply-pending-burn --mint <mint>

# Re-assert the mint's decryptable supply under the supply AES key (mint authority)
mosaic confidential update-supply --mint <mint> --supply <raw_base_units>

# Prove the available balance is zero so the account can be closed
mosaic confidential empty-account --mint <mint> [--token-account <address>]

# Inspect confidential-transfer account state (decrypts balances with the owner keypair)
mosaic confidential inspect-account \
  --mint <mint> \
  [--token-account <address>] \
  [--decrypt-pending]
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
mosaic token-acl create --mint <mint> [--gating-program <address>]

# Set/Update the gating program
mosaic token-acl set-gating-program --mint <mint> --gating-program <address>

# Enable permissionless thaw on a mint
mosaic token-acl enable-permissionless-thaw --mint <mint>

# Thaw a frozen token account (authority required)
mosaic token-acl thaw --token-account <ata>

# Permissionless thaw for your own ATA (if enabled)
mosaic token-acl thaw-permissionless --mint <mint>
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
mosaic token-acl enable-permissionless-thaw --mint <MINT>

# Confidential balances: configure, deposit, apply, then inspect
mosaic confidential configure-account --mint <MINT>
mosaic confidential deposit --mint <MINT> --amount 10
mosaic confidential apply --mint <MINT>
mosaic confidential inspect-account --mint <MINT> --decrypt-pending
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

- This CLI uses `@solana/kit` for RPC and `@solana-program/token-2022` for SPL Token-2022 helpers.
- Command output includes addresses and signatures suitable for copy/paste.

## License

MIT

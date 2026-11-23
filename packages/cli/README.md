# @solana/mosaic-cli

CLI for building and operating Token-2022 mints with modern extensions on Solana. Pairs with `@solana/mosaic-sdk` and uses your filesystem keypair or the Solana CLI config by default.

## Features

- **Templates**: Create Stablecoin, Arcade Token, and Tokenized Security mints
- **Operations**: Mint, transfer, force-transfer (permanent delegate), inspect mints
- **Access control**: Manage allowlists/blocklists
- **Token ACL**: Create config, set gating program, enable permissionless thaw, thaw/freeze
- **Confidential balances**: Configure accounts, deposit/apply/withdraw, confidential transfer, confidential mint/burn, and inspect encrypted state

## Installation

Requires Node.js 20.19+.

```bash
# from npm
npm install -g @solana/mosaic-cli
mosaic --help

# or inside this monorepo
pnpm i && pnpm -w build
node packages/cli/bin/mosaic.mjs --help
```

## Global options

Note that all commands expect the fee payer to be the authority for the action executed. All commands accept:

```bash
--rpc-url <url>    # RPC endpoint (default: Solana CLI config json_rpc_url, then https://api.devnet.solana.com)
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

> **Confidential balances.** `create stablecoin` and `create tokenized-security` set up the extension (see the flags below), and the [`mosaic confidential`](#confidential-balances) group operates it at runtime. For the underlying primitives see the [SDK confidential guide](../sdk/README.md#confidential-balances--transfers).

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
  [--confidential-policy <opt-in|whitelist>] \
  [--auditor-elgamal-pubkey <address>] \
  [--confidential-mint-burn --supply-keypair <path>] \
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
  [--permanent-delegate-authority <address>] \
  [--permissioned-burn-authority <address>] \
  [--multiplier <number=1>] \
  [--scaled-ui-amount-authority <address>] \
  [--confidential-policy <opt-in|whitelist>] \
  [--auditor-elgamal-pubkey <address>] \
  [--confidential-mint-burn --supply-keypair <path>] \
  [--mint-keypair <path>]
```

The confidential flags of `create stablecoin` and `create tokenized-security`:

- `--confidential-policy <opt-in|whitelist>`: with `whitelist` (the default) the confidential balances authority approves each account; with `opt-in` holders configure their own.
- `--auditor-elgamal-pubkey <address>`: an auditor that can decrypt every confidential transfer amount.
- `--confidential-mint-burn --supply-keypair <path>`: add the `ConfidentialMintBurn` extension, so the supply only ever exists encrypted and plaintext mint, burn, deposit and withdraw stop working on the mint. The supply is encrypted under keys derived from the `--supply-keypair` wallet. Use a dedicated wallet: one that also holds confidential balances would protect them and the supply with the same key. The supply authority never signs, so this also works with `--raw-tx`.

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

### Confidential balances

Runtime operations for Token-2022 confidential balances. Every command takes `-m, --mint`, and the account commands default `--token-account` to the signer's ATA.

- Commands that derive an account owner's confidential keys (configure-account, transfer, withdraw, burn, empty-account) need the owner's real keypair and can't run with `--raw-tx`.
- Mint, apply-pending-burn and update-supply are signed by the mint authority, which can be an external signer with `--raw-tx`. Their supply keys come from `--supply-keypair` (defaulting to `--keypair`, and required with `--raw-tx`).
- Proof flows span several transactions (proof setup, the operation, cleanup), sent one at a time. A send is retried only on rate limits, an unknown blockhash, or a transaction that expired unconfirmed, never on a transaction that failed on chain.
- `--tx-version 1` packs them into fewer, larger [SIMD-0385](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md) transactions. It needs an Agave 4.2.2+ RPC, and can't be combined with `--raw-tx`, since each transaction's resource limits come from simulating it after the previous one landed.
- With `--raw-tx`, the printed transactions already carry the signatures of keys the CLI holds (such as the ephemeral proof accounts). Sign and send them in the printed order, before the blockhash expires.

```bash
# Configure (create/reallocate) a token account for confidential transfers
mosaic confidential configure-account --mint <mint> [--token-account <address>] [--max-pending-credits <number>]

# Approve a configured account (whitelist-policy mints; confidential balances authority)
mosaic confidential approve --mint <mint> (--owner <wallet> | --token-account <address>)

# Enable / disable incoming credits (--non-confidential toggles plaintext credits)
mosaic confidential enable-credits  --mint <mint> [--token-account <address>] [--non-confidential]
mosaic confidential disable-credits --mint <mint> [--token-account <address>] [--non-confidential]

# Deposit plaintext balance -> pending confidential balance
mosaic confidential deposit --mint <mint> --amount <decimal> [--token-account <address>]

# Apply pending -> available confidential balance
mosaic confidential apply --mint <mint> [--token-account <address>]

# Withdraw available confidential balance -> plaintext balance
mosaic confidential withdraw --mint <mint> --amount <decimal> [--token-account <address>]

# Confidentially transfer to another confidential account (uses the mint's auditor by default)
mosaic confidential transfer \
  --mint <mint> \
  --to <recipient_owner> \
  --amount <decimal> \
  [--token-account <address>] \
  [--to-token-account <address>] \
  [--auditor-elgamal-pubkey <address>]

# Confidentially mint into a confidential balance (ConfidentialMintBurn mints; mint authority)
mosaic confidential mint \
  --mint <mint> \
  --amount <decimal> \
  --to <recipient_owner> \
  [--supply-keypair <path>] \
  [--to-token-account <address>] \
  [--auditor-elgamal-pubkey <address>]

# Confidentially burn from a confidential balance (account owner). On permissioned burn
# mints the burn authority co-signs; pass its keypair if it differs from the signer.
mosaic confidential burn \
  --mint <mint> \
  --amount <decimal> \
  [--token-account <address>] \
  [--auditor-elgamal-pubkey <address>] \
  [--permissioned-burn-keypair <path>]

# Apply the mint's accumulated pending burn into its confidential supply (mint authority).
# --supply is the true total supply AFTER this apply, in raw base units: the command
# re-encrypts the decryptable supply in the same plan, which keeps the next confidential
# mint's proof valid. It is asserted, not verified, so track the supply yourself (mint
# amounts added, applied burn amounts subtracted).
mosaic confidential apply-pending-burn --mint <mint> --supply <raw_base_units> [--supply-keypair <path>]

# Re-assert the decryptable supply (mint authority). A repair tool for a supply that drifted;
# the normal cycle never needs it.
mosaic confidential update-supply --mint <mint> --supply <raw_base_units> [--supply-keypair <path>]

# Prove the available balance is zero so the account can be closed
mosaic confidential empty-account --mint <mint> [--token-account <address>]

# Inspect an account's confidential state. Balances are decrypted when the signer owns the
# account, whether it is named by --token-account or is the signer's ATA.
mosaic confidential inspect-account --mint <mint> [--token-account <address>] [--decrypt-pending]
```

Every command above except `inspect-account` also takes `--tx-version <0|1>`.

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
```

## Development

```bash
pnpm i
pnpm build
pnpm dev:run <command> …    # run from source (tsx, e.g. pnpm dev:run inspect-mint --help)
pnpm dev                    # watch build (tsc --watch)
pnpm start                  # run the built CLI (bin/mosaic.mjs)
pnpm type-check
pnpm lint && pnpm lint:fix
```

## Notes

- This CLI uses `@solana/kit` for RPC and `@solana-program/token-2022` for SPL Token-2022 helpers.
- Command output includes addresses and signatures suitable for copy/paste.

## License

MIT

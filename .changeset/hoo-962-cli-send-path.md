---
'@solana/mosaic-cli': minor
---

The CLI can now sign and send every transaction with `--keypair`, and `--raw-tx <b64|b58>` builds a transaction for an external signer from `--authority`/`--fee-payer` alone, without reading any keypair. Before this, no command could send, and the three `create` commands could not even print a raw transaction.

## Behaviour changes

**Without `--raw-tx`, commands now sign and send.** `--raw-tx` used to default to `b64`, so every command printed an unsigned transaction and ignored `--keypair`. The default was removed in [#105](https://github.com/solana-foundation/mosaic/pull/105) without a release note; this is the first release that carries it. Scripts that relied on the old default output must pass `--raw-tx b64` explicitly. Otherwise the command now signs with `--keypair` (or the Solana CLI default keypair) and submits the transaction.

**Without `--raw-tx`, `--authority`, `--fee-payer` and `--mint-authority` must match the `--keypair` signer.** The CLI can only sign with `--keypair`, so a different address is now rejected before anything is built, instead of being silently ignored or failing at send time with a missing signature. Pass `--raw-tx` to build a transaction for another signer.

**`--raw-tx` output from `create` carries the mint's signature.** The mint keypair, generated or loaded with `--mint-keypair`, never leaves the CLI process, so it signs the printed transaction; the authority and fee payer slots stay empty for the external signer. The same applies to `--permissioned-burn-keypair` on `burn`/`force-burn`. When `--authority` or `--fee-payer` names the address of one of these keys, for example a co-signer that also pays, that slot is signed too. Every other raw transaction is unchanged: no signatures. The new mint's address is printed to stderr, keeping stdout to the transaction alone.

**`--fee-payer` is honoured by `allowlist add|remove` and `blocklist add|remove`.** These used to pay with the authority regardless.

## Fixes

- `create arcade-token|stablecoin|tokenized-security` read the global `--authority`/`--fee-payer`, and pass the mint authority to the SDK as a signer. Previously the raw path crashed with `Cannot read properties of undefined (reading 'address')`, or with `mintAuthority must be a TransactionSigner` when `--mint-authority` was given, and the send path crashed with the same SDK error.
- With `--raw-tx`, `--authority`/`--fee-payer` no longer require a readable keypair. `token-acl freeze|thaw` and every command that used the same pattern loaded the default keypair before checking for an override, so they died with `Failed to load keypair … ENOENT` on a machine without `~/.config/solana/id.json`.
- `force-transfer` passed the permanent delegate and fee payer as bare addresses, so its send path built an unsigned transaction.
- `token-acl enable-permissionless-thaw --raw-tx` cast bare addresses to signers, and `control pause` passed a bare `--fee-payer` string where the SDK needs a signer.
- `control resume` ignored `--fee-payer`.
- `mint` printed the mint authority as `[object Object]`.
- An invalid `--authority`/`--fee-payer` address is now reported by name, and raw mode with neither `--authority` nor a keypair says which flag to pass.

All signer resolution now goes through one helper (`resolveSigner`/`resolveSigners` in `packages/cli/src/utils/solana.ts`). The CLI package also gains its first unit tests (`pnpm --filter @solana/mosaic-cli test`).

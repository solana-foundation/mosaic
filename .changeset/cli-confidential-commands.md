---
'@solana/mosaic-cli': minor
---

Add the `mosaic confidential` command group for Token-2022 confidential balances (HOO-2911): `configure-account`, `approve`, `enable-credits`, `disable-credits`, `deposit`, `apply`, `transfer`, `withdraw`, `empty-account`, `mint`, `burn`, `apply-pending-burn`, `update-supply` and `inspect-account`.

- Every command that sends takes `--tx-version <0|1>`. Version 1 packs a proof flow into fewer, larger transactions and needs an Agave 4.2.2+ RPC.
- `mint`, `apply-pending-burn` and `update-supply` take `--supply-keypair`, the supply authority's wallet. The mint authority signs and can be an external signer under `--raw-tx`.
- The multi-transaction send path retries only rate limits, an unknown blockhash, and a transaction that expired unconfirmed. It never retries a transaction that failed on chain, and never resends while the first copy can still land.
- `inspect-account` decrypts whenever the signer owns the account, including one named by `--token-account`, and rejects an account of another mint.

`create stablecoin` and `create tokenized-security` gain `--confidential-policy <opt-in|whitelist>`, `--auditor-elgamal-pubkey <address>`, and `--confidential-mint-burn --supply-keypair <path>`.

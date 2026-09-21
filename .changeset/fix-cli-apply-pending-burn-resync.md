---
'@solana/mosaic-cli': patch
---

Fix `mosaic confidential apply-pending-burn` leaving a `ConfidentialMintBurn` mint unable to mint again

`apply-pending-burn` built its instruction plan without `resyncSupply`, so it advanced the mint's ElGamal `confidentialSupply` while leaving the AES `decryptableSupply` stale. The next `confidential mint` then built its equality proof from the stale value and was rejected, with no indication that a desynced supply was the cause. The command now takes a required `--supply <raw_base_units>` — the true total supply after the apply — and re-asserts the decryptable supply in the same plan. Because it derives the supply keys, it no longer supports `--raw-tx`.

`confidential update-supply` is unchanged and remains the repair path for a mint whose supply already drifted.

Also: confidential subcommands no longer collapse an unrecognised failure to `Error: Unknown error`. The handler now describes anything thrown — including non-`Error` values such as the zk-sdk WASM proof errors, a `SolanaError`'s `context` detail, and nested `cause` chains — and prints program logs in addition to the message rather than instead of it. A failed confidential mint now reports `cryptographic component mismatch`.

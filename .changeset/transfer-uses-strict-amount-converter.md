---
'@solana/mosaic-sdk': minor
---

`transfer` now validates and converts amounts with the same strict converter the confidential path uses: the raw amount is scaled from the exact decimal string instead of a lossy `parseFloat` round-trip, so large (u64-scale) amounts transfer exactly. The spellings `parseFloat` accepted without precision loss (leading `+`, leading/trailing `.`, exponent notation) keep working: they are normalized exactly, on the string, before validation. The confidential path shares this converter, so it now accepts those spellings too, and exact amounts whose trailing zeros run past the mint decimals (`5.0` on a 0-decimal mint, `1.5000000` on a 6-decimal mint) are accepted everywhere instead of being rejected as over-precision.

This is a minor (not a patch) because `transfer` now throws where it previously accepted and silently truncated. Inputs that newly throw `Amount must be a positive number` or `Amount cannot have more than N decimal places`:

- amounts with more fractional digits than the mint's decimals (e.g. a 9-decimal UI string for a 6-decimal mint), including nonzero digits revealed by exponent expansion (`1e-7` on a 6-decimal mint)
- amounts below one base unit (`0.0000005` on a 6-decimal mint built a zero-amount transfer before)
- leading-numeric junk (`'1,000.5'` transferred `1` before)

Integrations that pass such strings should pre-validate or normalize them before upgrading. `assertValidAmountFormat` is exported from the SDK root so callers can run the decimals-independent checks (format, non-zero) up front, before any RPC.

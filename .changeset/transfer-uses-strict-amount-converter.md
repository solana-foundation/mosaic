---
'@solana/mosaic-sdk': patch
---

`transfer` now validates and converts amounts with the same strict converter the confidential path uses: non-numeric junk, over-precision and zero/sub-base-unit amounts are rejected with a clear error, and the raw amount is scaled from the exact decimal string instead of a lossy `parseFloat` round-trip. The spellings `parseFloat` accepted without precision loss (leading `+`, leading/trailing `.`, exponent notation) keep working: they are normalized exactly, on the string, before validation. The confidential path shares this converter, so it now accepts those spellings too, and exact amounts whose trailing zeros run past the mint decimals (`5.0` on a 0-decimal mint, `1.5000000` on a 6-decimal mint) are accepted everywhere instead of being rejected as over-precision.

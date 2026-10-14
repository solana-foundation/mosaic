---
'@solana/mosaic-sdk': patch
---

Scaled UI amount: a scheduled new multiplier passed to `withScaledUiAmount` is now applied at creation via `UpdateMultiplierScaledUiMint` (previously it was silently dropped). `newMultiplier` now defaults to `multiplier`; a new multiplier without an effective timestamp, a timestamp that looks like milliseconds, and a schedule whose scaled UI authority is neither the mint authority nor the fee payer now throw.

`inspectToken` now decodes transfer-fee (the fee active at the current epoch, the newer/older entries, withheld amount), interest-bearing (rates, timestamps, rate authority) and scaled-UI schedule (`newMultiplier`, `newMultiplierEffectiveTimestamp`) fields, exposed in extension `details`, as typed `transferFee` / `interestBearing` / `scaledUiAmount` summaries, and as string-safe fields on `TokenDashboardData`. Revoked (all-zero) transfer-fee, rate and scaled UI authorities are reported as `null`.

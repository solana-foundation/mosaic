---
'@solana/mosaic-sdk': patch
---

Add `resolveScaledUiMultiplier(schedule, nowSeconds?)`, which resolves the scaled UI multiplier in effect at a given Unix time (default now) from the `multiplier` / `newMultiplier` / `newMultiplierEffectiveTimestamp` fields of `ScaledUiAmountInfo` or `TokenDashboardData`. It returns the multiplier in effect plus the scheduled change, if any, with whether it has taken effect: a change counts as scheduled when its timestamp is above zero and the new multiplier differs, and it applies once the time reaches the timestamp, as Token-2022 does.

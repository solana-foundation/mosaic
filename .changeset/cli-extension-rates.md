---
'@solana/mosaic-cli': patch
---

`inspect-mint` now formats on-chain extension rates: basis points as `250 bps (2.50%)`, timestamps as ISO dates (`0 (not scheduled)` when unset), transfer-fee amounts with their decimal-adjusted value, and the newer and older transfer fee entries on one line each. The Compliance section adds Scaled UI Multiplier (the multiplier in effect now, including a scheduled change once its timestamp has passed), Scheduled Multiplier (when that change is still pending), Transfer Fee (the fee active now), Scheduled Transfer Fee (when a newer fee is still pending) and Interest Rate summary lines.

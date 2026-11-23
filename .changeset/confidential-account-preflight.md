---
'@solana/mosaic-sdk': patch
---

`createConfidentialWithdrawInstructionPlan` and `createConfidentialTransferInstructionPlan` now reject token accounts that don't belong to the mint or the authority before building a plan. The withdraw account and both transfer accounts must hold the passed `mint`, and the withdraw account and the transfer source must be owned by `authority`. Before, a mismatch only failed on-chain at the withdraw or transfer instruction, after the plan's first transactions had paid rent for the proof accounts, and the cleanup that would reclaim that rent never ran. The checks read the accounts the builders already fetch, so they cost no extra RPC.

The JSDoc of `createMintToTransaction` now says `amount` is a decimal amount scaled by the mint's decimals. It wrongly called it a raw amount already adjusted for decimals, and following it minted 10^decimals times too many tokens. Behaviour is unchanged.

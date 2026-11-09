# Confidential-transfer flows (HOO-891)

Scripted QA of the confidential-transfer wizard (`/confidential/<mint>`) on devnet: two test wallets, wallet-side failure modes, and every step checked on chain. Built on the general harness in [README.md](README.md); the suite's own files are `lib-confidential.sh`, `chain-confidential.mjs`, `flows/confidential-*.sh` and `groups/confidential*.group`.

```bash
pnpm e2e:agent confidential-free    # zero SOL: existing devnet fixtures, nothing is signed
pnpm e2e:agent confidential-v0      # the funded flows, confidential operations as version-0 transactions
pnpm e2e:agent confidential-v1      # the same flows as SIMD-0385 version-1 transactions (blocked today, see below)
pnpm e2e:agent confidential         # all three, as three runs
TX_VERSION=1 pnpm e2e:agent confidential-optin confidential-interrupt   # any subset, in order, at either version
REUSE_OUT=<run id> pnpm e2e:agent confidential-recipient                # resume on a run's opt-in mint
```

Wallet A needs 0.3 devnet SOL for the funded flows (refilled from the master wallet when there is one), and B is topped up from A. A full v0 run costs about 0.1 SOL.

| flow                              | SOL | covers                                                                                                                                                                       |
| --------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confidential-entry.sh`           | no  | HOO-1422: the `/manage` Confidential button for creation-labelled and imported tokens, both policies, absent without the extension, reachable by a non-creator               |
| `confidential-gating.sh`          | no  | HOO-1428 reasons on an unconfigured account; HOO-1421 non-authority view of step 2; HOO-1430 non-confidential mint, non-mint and invalid URLs, disconnects, account switch   |
| `confidential-wallet-failures.sh` | no  | HOO-1424: a wallet refusing the derivation message, and one without `signMessage`                                                                                            |
| `confidential-optin.sh`           | yes | HOO-1420 as a regression: A configure → deposit → apply → transfer to B → B apply → withdraw → empty, checked on chain at each step, plus the browser/Node key interop check |
| `confidential-validation.sh`      | yes | HOO-1427 amounts (zero, negative, non-numeric, too many decimals, beyond u64, over balance) on deposit/transfer/withdraw; HOO-1428 out-of-order and re-run steps             |
| `confidential-whitelist.sh`       | yes | HOO-1421 approve flow end to end; HOO-1425 transfer to an unapproved account: message, cost, stranded rent                                                                   |
| `confidential-recipient.sh`       | yes | HOO-1426 cases 1–6, including a fee mint (now supported by the SDK, so a positive test)                                                                                      |
| `confidential-interrupt.sh`       | yes | HOO-1429 wallet rejects the 1st/middle/last transaction, retry, leaving the page mid-plan, two plans at once                                                                 |

**Transaction versions.** The app plans confidential operations as version-1 transactions only when both the RPC (Agave ≥ 4.2.2; public devnet runs 4.4) and the wallet (`supportedTransactionVersions` includes `1`) support them, and no real wallet advertises v1 yet. So `confidential-v0` is what users get today and `confidential-v1` is the path the app switches to automatically once wallets do. The v1 groups set `tx-version: 1`, so the wallets are built with `--tx-v1`. Every `open_wizard` checks the app really is on the run's version (the version-0 notice shows exactly when it falls back), and plan lengths are version-aware: at v0 a transfer is 5 transactions and a withdraw 4; at v1 they are only expected to be shorter, and the interrupt flow rejects transactions 1 and 2 instead of 1, 3 and 5.

**The v1 run is blocked today** (exit status 3, `blocked` in the summary). `@solana/connector` 0.1.4's kit adapter (`createKitTransactionSigner`) hand-builds the legacy/v0 wire layout `[numSigs][zeroed signatures][message]` rather than using kit's encoder. For v0 that is byte-identical to kit's encoding; a v1 transaction starts with its message, so the wallet receives bytes it cannot decode and the first signature fails with "Failed to sign transaction 1 of 1". The app's v1 → v0 fallback (`V1_UNSUPPORTED` in `execute-confidential-plan.ts`) does not recognise that text, so the operation fails. This is not specific to the test wallet: as soon as a real wallet advertises v1, every confidential operation in the app fails the same way. The v1 flows are ready for when the signing path is fixed.

**On-chain checks** come from `chain-confidential.mjs` (chain.mjs plus confidential commands), which signs with the same keypairs and so derives the same confidential keys as the browser. `state` reports what `token` does plus `approved`/`allowConfidentialCredits`/credit counter, whether the Node-derived ElGamal key matches the one the browser registered (`keysMatchAccount`), and the decrypted pending and available balances. `contexts` counts the proof-context accounts a role still owns, i.e. rent a broken plan stranded; compare counts before and after a step, since the failure cases strand some on purpose (29 accounts, 0.058 SOL on wallet A by 2026-11-09). `create-mint` and `disable-credits` set up states the UI cannot reach.

**Rate limits.** Public devnet answers bursts with 429s, and the wizard builds plans over an RPC client without backoff, so a 429 while building fails a step before anything is signed (retried by `run_card`, recorded as HOO-1429), and a 429 after signing can make the card report failure for transactions that landed (never retried; the chain checks decide, and a case it leaves undecided is recorded as inconclusive).

**What stays manual:** real wallets (Phantom, Solflare, Backpack, Jupiter) for HOO-1423's compatibility matrix and the Phantom guard experiment, the feel of real wallet prompts across a 5-transaction plan, and the final read of whether the error copy is good enough. A script only checks that the copy names the precondition.

## Not done yet

- Creating confidential tokens through the creation forms (HOO-1422's "each creation path" half is covered by seeding the labels the forms write).
- RPC failure injection for HOO-1429 (`network route --body` can return a JSON-RPC "Too Many Requests" error) and blockhash expiry on a stalled prompt.
- Reclaiming stranded proof-context rent (`chain-confidential.mjs` could close them with the owner's key), which is also the recovery path HOO-1429 asks the app for.

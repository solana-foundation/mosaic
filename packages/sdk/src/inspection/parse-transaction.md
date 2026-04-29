# parseTokenTransaction / parseConfirmedTransaction

Decodes Solana transactions into a categorized, queryable view of their
Token‑2022, Associated‑Token, and System Program activity. Built for
**indexing pipelines** — ingest confirmed transactions, classify them by what
they actually did to a mint or token account, and write the result into a
database or search index.

There are two entry points depending on what you have:

| Have…                                          | Use                                | Sees CPIs?          |
| ---------------------------------------------- | ---------------------------------- | ------------------- |
| A `getTransaction` response (post-execution)   | `parseConfirmedTransaction`        | Yes — outer + inner |
| Just raw wire bytes (pre-sign / pre-execution) | `parseTokenTransaction`            | No — outer only     |
| Wire bytes for a v0 tx with LUTs + an RPC      | `parseTokenTransactionWithLookups` | No — outer only     |

For an indexer, you almost always want `parseConfirmedTransaction`.

## Indexing a confirmed transaction

```ts
import { parseConfirmedTransaction } from '@solana/mosaic-sdk';

const tx = await rpc
    .getTransaction(signature, {
        commitment: 'confirmed',
        encoding: 'base64',
        maxSupportedTransactionVersion: 0,
    })
    .send();

if (!tx) return; // dropped or not yet visible

const parsed = parseConfirmedTransaction(tx);

// Fast path: if the indexer only cares about token-2022 events
for (const ix of parsed.token2022Instructions) {
    indexT22Event({
        signature,
        slot: tx.slot,
        category: ix.category, // 'transfer' | 'mint-init' | 'pause' | ...
        name: ix.token2022.name, // 'TransferChecked', 'Pause', etc.
        accounts: ix.accounts.map(a => a.address),
        // The decoded payload is your source of truth for amount, decimals,
        // authority types, new metadata fields, etc.
        parsed: ix.token2022.parsed,
    });
}
```

`parseConfirmedTransaction` walks both outer instructions and the CPIs in
`meta.innerInstructions`. Inner instructions are attached under each outer
instruction's `innerInstructions` field, so you can preserve the call
hierarchy in your schema, and they're also exposed flat under
`parsed.flatInnerInstructions` for "did anything in this tx do X?" lookups.

```ts
parsed.instructions[0].innerInstructions; // CPIs out of the first outer ix
parsed.flatInnerInstructions; // every CPI across the whole tx
parsed.token2022Instructions; // outer + inner Token-2022 ixs
parsed.summary; // category counts (outer + inner)
parsed.error; // meta.err passthrough — null/undefined on success
```

## Pre-execution parsing

For mempool tooling, simulators, or pre-sign hooks where you only have wire
bytes and execution hasn't happened yet:

```ts
const parsed = parseTokenTransaction(wireBytes);
// Or with explicit format if you have a string:
parseTokenTransaction({ format: 'base64', data: b64 });
parseTokenTransaction({ format: 'base58', data: b58 });

// v0 with LUTs: either supply pre-fetched LUT contents…
parseTokenTransaction(wireBytes, { addressesByLookupTableAddress });
// …or hand it an RPC and let it fetch them.
await parseTokenTransactionWithLookups(wireBytes, rpc);
```

CPIs aren't visible at this stage — they only exist after execution.

## What about non‑Token‑2022 instructions?

**Nothing is dropped.** Every instruction (outer and inner) shows up in the
result with `index`, `programAddress`, `accounts`, `rawData`, and
`stackHeight`. The difference is what we do with the data field:

| Program          | `programLabel`       | `category`                    | Decoded payload                                                                                                                  |
| ---------------- | -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Token‑2022       | `'token-2022'`       | per‑instruction (see enum)    | full `ParsedToken2022Instruction` (named accounts + decoded data)                                                                |
| Associated Token | `'associated-token'` | `'account-init'`              | full `ParsedAssociatedTokenInstruction`                                                                                          |
| System Program   | `'system'`           | `'account-init'` or `'other'` | parsed for `CreateAccount`, `CreateAccountWithSeed`, `Allocate`, `AllocateWithSeed`, `TransferSol`; identified-only for the rest |
| Token‑ACL        | `'token-acl'`        | `'other'`                     | none — discriminator not decoded                                                                                                 |
| Anything else    | `'unknown'`          | `'other'`                     | none                                                                                                                             |

Use `result.token2022Instructions` if you only care about T2022, or filter
`result.instructions` yourself by `programLabel`.

## Recommendations for indexers

1. **Index both outer and inner instructions, but preserve `stackHeight`.**
   `flatInnerInstructions` is the cheapest way to get a flat list to feed
   into your DB. `stackHeight` (1 = outer, 2+ = inner) lets you reconstruct
   the call tree later if you need to.
2. **Treat `category` as a coarse bucket for filtering, the parsed payload as
   the source of truth.** A `category: 'transfer'` row could be a
   `TransferChecked`, `TransferCheckedWithFee`, or a confidential variant —
   each has different fields. Index `token2022.name` alongside the category
   when shape matters downstream.
3. **Always handle `parsed === undefined`.** Some real on‑chain payloads
   (e.g. SPL token‑metadata interface variants) carry shapes that the
   codama-generated codec can't always decode. We surface a `parseError`
   string instead of throwing, so identification still succeeds and the rest
   of the transaction still indexes cleanly. Plan your schema to allow rows
   with `name` set but `parsed` null.
4. **Handle failed transactions.** `result.error` mirrors `meta.err`. You
   typically still want to index attempts and authorities, even on failure,
   so don't filter the whole tx out — just tag the row.
5. **Don't double‑count outer + inner.** `summary` and the filtered views
   (`token2022Instructions`, `transferInstructions`, `adminInstructions`)
   include inner instructions. If you want an outer-only count, walk
   `result.instructions` directly.
6. **For pre-execution use, expect `parseTokenTransaction` to throw on v0
   transactions with unresolved LUTs.** Either pass
   `addressesByLookupTableAddress` or use the async lookup-fetching variant.
   Wrap calls in try/catch in any pipeline that ingests untrusted bytes.

## Regenerating on-chain test fixtures

The unit tests under `__tests__/` run against real wire bytes captured from a
local Solana cluster. To refresh them after SDK changes:

```bash
REGENERATE_FIXTURES=true pnpm --filter @solana/mosaic-sdk \
  exec jest src/__tests__/integration/capture-fixtures.test.ts
```

This writes two fixture files — outer-only (`onchain-transactions.ts`) and
full confirmed snapshots (`onchain-confirmed-transactions.ts`) — that the
unit suite consumes without needing chain access.

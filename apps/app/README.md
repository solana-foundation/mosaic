# @mosaic/app

UI for creating and managing Token-2022 mints with Mosaic. It’s a Next.js app that connects to Solana wallets, guides you through mint creation (Stablecoin, Arcade Token, Tokenized Security), and provides a dashboard to manage authorities, access lists, and account state.

## What you can do

- **Create tokens**: Step-by-step flows for Stablecoin, Arcade Token, and Tokenized Security
- **Manage tokens**: Mint, transfer, freeze/thaw, force-transfer, update authorities
- **Control access**: Manage allowlists/blocklists and link them to mints
- **Wallet-ready**: Connect a Solana wallet and sign transactions

## Getting started

```bash
pnpm i
pnpm dev
# open http://localhost:3000
```

By default the app uses Devnet. The cluster list and default network are configured in
`src/app/providers.tsx`; the network is selectable in-app via the wallet menu → Network
Settings, and your choice is persisted across reloads.

## User guide

- **Home**: Overview and entry points to the dashboard
- **Dashboard** (`/dashboard`)
    - Connect a wallet to see your locally saved tokens
    - Create new tokens from the dropdown (Stablecoin, Arcade Token, Tokenized Security)
    - Click any token to manage it
- **Create flows** (`/dashboard/create/*`)
    - Fill in name, symbol, decimals, and metadata URI
    - Choose access control: allowlist (closed-loop) or blocklist
    - Optionally customize authorities; if you don’t, the connected wallet is used
    - Submit to create the mint; results are saved locally for quick access
- **Manage token** (`/dashboard/manage/[address]`)
    - View overview, authorities, extensions, and transfer restrictions
    - Mint and transfer tokens (ATA auto-created; permissionless thaw if enabled)
    - Freeze/thaw accounts
    - Manage allowlists/blocklists and set extra metas on the mint

Notes:

- If fee payer equals mint authority, the app also sets up Token ACL config, gating program, ABL list, extra metas, and enables permissionless thaw.
- Token entries are persisted in local storage (`TokenStorage`).
- **Confidential Balances** is available in the dashboard as a token-creation capability (Stablecoin and Tokenized Security). Confidential **mint/burn** is marked "coming soon" in the UI. The full confidential runtime flow (deposit/apply/transfer/withdraw/mint/burn) currently lives in the SDK — see the [SDK confidential guide](../../packages/sdk/README.md#confidential-balances--transfers).

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                    # Landing
│  ├─ dashboard/
│  │  ├─ page.tsx                 # Dashboard (token list, create entry points)
│  │  ├─ create/
│  │  │  ├─ stablecoin/*          # Stablecoin create form
│  │  │  ├─ arcade-token/*        # Arcade create form
│  │  │  └─ tokenized-security/*  # Security create form
│  │  └─ manage/[address]/*       # Token management views
│  ├─ layout.tsx                  # Providers and layout
│  └─ providers.tsx               # Connector config: cluster list + default network
├─ components/
│  ├─ layout/*                    # Header/Footer
│  ├─ ui/*                        # Reusable UI
│  └─ sections/hero.tsx           # Landing hero
├─ features/wallet/*              # Connect button, wallet modal, network switcher
├─ stores/
│  ├─ rpc-store.ts                # User-defined custom RPC endpoints
│  └─ network-notice-store.ts     # One-time "you're on X" notice flag
├─ lib/
│  ├─ issuance/*                  # High-level create flows using @solana/mosaic-sdk
│  ├─ management/*                # Mint/transfer/freeze/thaw helpers
│  ├─ management/accessList.ts    # Allowlist/blocklist helpers
│  ├─ token/*                     # Local storage + token data
│  ├─ solana/rpc.ts               # RPC utils
│  └─ solana/network.ts           # Default network resolution
└─ types/*                        # App types
```

## Configuration

- Wallets and clusters: configured in `app/providers.tsx` via `@solana/connector` (Devnet by default)
- Network switching: `features/wallet/components/wallet-dropdown-content.tsx`; user-defined RPCs live in `stores/rpc-store.ts`
- SDK: all blockchain operations use `@solana/mosaic-sdk`

### Environment Variables

Both are inlined at build time, so changing either requires a rebuild/redeploy.

- `NEXT_PUBLIC_SOLANA_NETWORK`: The network the app boots into when the user has never picked one. Accepts `devnet`, `testnet`, or `mainnet-beta` (`mainnet` is an alias). Defaults to `devnet`. This sets the **default**, not a hard override: a user's explicit in-app network choice is persisted and wins on their next visit.
- `NEXT_PUBLIC_SOLANA_RPC_URL`: Custom Solana RPC endpoint URL, attached to the **Mainnet** cluster entry. Since the app defaults to Devnet, a paid mainnet endpoint also needs `NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta` for users to land on it. This variable is exposed to the client-side and available in production builds. See `.env.example` for more details.

## Development

```bash
pnpm type-check
pnpm lint
pnpm build
pnpm start
```

## Troubleshooting

- Ensure the connected wallet has SOL for fees on the selected cluster
- If a transfer destination ATA doesn’t exist, the app will create it idempotently
- Permissionless thaw requires Token ACL config and ABL list correctly set on the mint

## Tech stack

- Next.js 15, React 18, TailwindCSS
- Wallet adapters (`@solana/wallet-adapter-*`)
- Mosaic SDK (`@solana/mosaic-sdk`) and `@solana/kit`

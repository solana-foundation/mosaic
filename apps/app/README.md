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

By default the app uses Devnet. Cluster is selectable in-app via `ChainContextProvider`.

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
│  └─ layout.tsx                  # Providers and layout
├─ components/
│  ├─ solana-provider.tsx         # Wallet adapter providers
│  ├─ layout/*                    # Header/Footer
│  ├─ ui/*                        # Reusable UI
│  └─ sections/hero.tsx           # Landing hero
├─ context/
│  ├─ ChainContextProvider.tsx    # Cluster selection (devnet/testnet/mainnet)
│  ├─ RpcContextProvider.tsx      # gill RPC + subscriptions
│  └─ SelectedWalletAccount*      # Selected wallet state
├─ lib/
│  ├─ issuance/*                  # High-level create flows using @mosaic/sdk
│  ├─ management/*                # Mint/transfer/freeze/thaw helpers
│  ├─ management/accessList.ts    # Allowlist/blocklist helpers
│  ├─ token/*                     # Local storage + token data
│  └─ solana/rpc.ts               # RPC utils
└─ types/*                        # App types
```

## Configuration

- Wallets: configured in `components/solana-provider.tsx` (uses Devnet endpoint by default)
- RPC/cluster: provided by `ChainContextProvider` and `RpcContextProvider` (Devnet/Testnet/Mainnet)
- SDK: all blockchain operations use `@mosaic/sdk`

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
- Mosaic SDK (`@mosaic/sdk`) and `gill` (`@solana/kit`)

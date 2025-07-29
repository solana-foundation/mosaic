# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Mosaic is a TypeScript monorepo for managing Token-2022 extensions on Solana, specifically designed for Stablecoin and Arcade Token use cases. The project uses pnpm workspaces with the following structure:

- **@mosaic/sdk** (`packages/sdk/`) - Core SDK with token templates and management utilities
  - Uses `gill` library for Solana interactions
  - Provides `Token` class for building token transactions with extensions
  - Contains predefined templates for stablecoin and arcade tokens
  - Token extensions include: Metadata, Pausable, Default Account State, Confidential Balances, Permanent Delegate
- **@mosaic/cli** (`packages/cli/`) - Command-line interface (scaffolded)
- **@mosaic/ui** (`packages/ui/`) - Next.js web interface with Tailwind CSS and Radix UI components

## Token Types

### Stablecoin

- Default Account State (SRFC blocklist for compliance)
- Metadata, Confidential Balances, Pausable, Permanent Delegate

### Arcade Token

- Default Account State (SRFC allowlist for programs/users)
- Metadata (rich gaming metadata), Permanent Delegate, Pausable

## Common Development Commands

```bash
# Install dependencies
pnpm install

# Development (runs dev for all packages)
pnpm dev

# Build all packages
pnpm build

# Testing
pnpm test              # Run all tests
pnpm test:watch        # SDK watch mode (in packages/sdk/)
pnpm test:coverage     # SDK coverage (in packages/sdk/)

# Code quality
pnpm lint              # Lint all packages
pnpm lint:fix          # Fix linting issues
pnpm format            # Format with Prettier
pnpm format:check      # Check formatting
pnpm type-check        # TypeScript checking
pnpm check             # Run format:check + lint + type-check

# Before committing
pnpm precommit         # format + lint:fix
```

## Package-Specific Commands

### SDK (packages/sdk/)

- Uses Jest for testing
- Main entry point exports `Token` class and templates
- Test setup in `src/__tests__/setup.ts`

### UI (packages/ui/)

- Next.js 14 with App Router
- Tailwind CSS + Radix UI components
- Theme support with next-themes

## Development Notes

- Project is currently scaffolded - implementation depends on Token-2022 program stabilization and SRFC 37 spec
- Uses `gill` library for Solana RPC interactions
- All token creation functions return `FullTransaction` objects ready for signing
- Node.js 18+ and pnpm 9+ required
- TypeScript 5+ for all packages

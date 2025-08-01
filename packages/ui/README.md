# @mosaic/ui

Web interface for managing Token-2022 tokens with extensions.

## Purpose

A beautiful and modern web application for creating and managing Token-2022 tokens:

- 🎨 **Modern UI**: Beautiful, responsive interface built with best UX practices
- 🪙 **Token Creation**: Visual workflow for creating stablecoins and arcade tokens
- 🔧 **Token Management**: User-friendly token management interface
- 📋 **SRFC Management**: Visual management of allowlists and blocklists
- 🔗 **Wallet Integration**: Seamless Solana wallet connectivity

## Features

### Token Creation Wizard

- ✅ Step-by-step token creation process
- ✅ Template selection (Stablecoin vs Arcade Token)
- ✅ Extension configuration with visual guides
- ✅ Real-time preview of token properties
- ✅ Form validation and error handling

### Token Management Dashboard

- ✅ Overview of all created tokens
- ✅ Token balance and supply information
- ✅ Extension status indicators
- ✅ Quick actions for common operations
- ✅ Wallet connection status

### SRFC List Management

- ✅ Visual allowlist/blocklist editor
- ✅ Address validation for Solana addresses
- ✅ Add/remove addresses from lists
- ✅ Different list types based on token type (allowlist for arcade tokens, blocklist for stablecoins)

### Wallet Integration

- ✅ Support for popular Solana wallets
- ✅ Connection status indicators
- ✅ Wallet adapter integration
- ✅ Account switching support

## Tech Stack

### Frontend Framework

- **React 18** with TypeScript
- **Next.js 15** for SSR and routing
- **Tailwind CSS** for styling
- **Lucide React** for icons

### Solana Integration

- **@solana/wallet-adapter** for wallet connectivity
- **@solana/web3.js** for blockchain interactions
- **@mosaic/sdk** for token operations

### UI Components

- **Radix UI** for accessible components
- **Lucide React** for icons
- **Class Variance Authority** for component variants
- **Tailwind Merge** for class merging

## Architecture

```
ui/
├── src/
│   ├── app/             # Next.js app directory
│   │   ├── dashboard/   # Main dashboard
│   │   │   ├── create/  # Token creation pages
│   │   │   │   ├── stablecoin/    # Stablecoin creation
│   │   │   │   └── arcade-token/  # Arcade token creation
│   │   │   └── manage/  # Token management pages
│   │   │       └── [address]/     # Individual token management
│   │   └── globals.css  # Global styles
│   ├── components/      # Reusable UI components
│   │   ├── ui/         # Base UI components
│   │   ├── layout/     # Layout components
│   │   └── sections/   # Page sections
│   ├── lib/            # Utility functions
│   │   ├── stablecoin.ts    # Stablecoin creation logic
│   │   ├── arcadeToken.ts   # Arcade token creation logic
│   │   ├── mockFunctions.ts # Mock implementations
│   │   └── tokenData.ts     # Token data management
│   └── types/          # TypeScript types
│       ├── token.ts    # Token-related types
│       └── wallet.ts   # Wallet-related types
<!-- ├── public/             # Static assets
└── styles/             # Global styles -->
```

## Dependencies

- `@mosaic/sdk` - Token templates and functionality
- `next` - React framework
- `react` & `react-dom` - React library
- `@solana/wallet-adapter-*` - Wallet integration
- `tailwindcss` - CSS framework
- `@radix-ui/react-*` - UI components
- `lucide-react` - Icon library
- `class-variance-authority` - Component variants

## Implementation Status

✅ **Fully Implemented** - The web application provides:

- ✅ Intuitive token creation workflows for both stablecoins and arcade tokens
- ✅ Comprehensive token management interface with individual token pages
- ✅ Beautiful, responsive design with modern UI components and dark/light themes
- ✅ Seamless Solana wallet integration with multiple wallet support
- ✅ Real-time form validation and error handling
- ✅ Production-ready implementations using @mosaic/sdk
- ✅ Allowlist/blocklist management with address validation
- ✅ Token mint, transfer, and force transfer functionality
- ✅ Freeze/thaw account management
- ✅ Authority management and updates
- ✅ Extension status indicators and management

### Current Features

#### Token Creation
- **Multi-step Forms**: Guided token creation with parameter validation
- **Template Selection**: Choose between stablecoin and arcade token templates
- **Authority Configuration**: Set different authorities for various token functions
- **Extension Preview**: Real-time preview of selected Token-2022 extensions
- **Transaction Confirmation**: Clear feedback on transaction status

#### Token Management
- **Dashboard Overview**: Visual representation of all created tokens
- **Individual Token Pages**: Detailed management for each token
- **Mint Operations**: Create new tokens for specified recipients
- **Transfer Operations**: Standard and force transfer functionality
- **Account Freeze/Thaw**: Control account access to tokens
- **Authority Updates**: Modify token authorities as needed

#### Access Control
- **Visual List Management**: Intuitive interface for allowlists and blocklists
- **Address Validation**: Real-time validation of Solana addresses
- **Bulk Operations**: Add or remove multiple addresses at once
- **List Type Detection**: Automatic detection of list type based on token template

#### Wallet Integration
- **Multi-wallet Support**: Compatible with major Solana wallets
- **Connection Status**: Clear indication of wallet connection state
- **Account Switching**: Handle multiple wallet accounts
- **Transaction Signing**: Seamless transaction signing workflow

### Technical Implementation

- **Production Ready**: Uses actual @mosaic/sdk functions for all operations
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **TypeScript**: Fully typed with comprehensive type definitions
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Performance**: Optimized with React 18 features and Next.js 15
- **Accessibility**: Built with Radix UI for accessible components

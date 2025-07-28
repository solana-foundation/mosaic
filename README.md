# Mosaic

A comprehensive TypeScript SDK, CLI, and UI for managing standard token types on Solana, specifically designed for Stablecoin and Arcade Token use cases to start.

## 🏗️ Project Structure

This monorepo contains scaffolding for the following packages:

- **@mosaic/core** - Core library wrapping Solana/Kit & Token-2022 with hooks for issuance and management
- **@mosaic/sdk** - SDK with token templates and exported functionality for CLI & UI
- **@mosaic/cli** - Command-line interface for token management
- **@mosaic/ui** - Web interface for token management

## 🪙 Token Types

### Stablecoin

Token-2022 Extensions:

- **Default Account State** - SRFC blocklist for compliance
- **Metadata** - On-chain token metadata
- **Confidential Balances** - Privacy-preserving transactions
- **Pausable** - Emergency controls
- **Permanent Delegate** - Regulatory compliance features

### Arcade Token

Token-2022 Extensions:

- **Default Account State** - SRFC allowlist for programs and users
- **Metadata** - Rich on-chain metadata for gaming
- **Permanent Delegate** - Game mechanics control
- **Pausable** - Administrative controls

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Solana CLI

### Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install
```

## 📦 Package Structure

```
packages/
├── core/           # Core Token-2022 wrapper library
│   └── src/       # TypeScript source files (to be implemented)
├── sdk/            # Token templates and SDK functionality
│   └── src/
│       ├── templates/  # Token type templates
│       ├── factories/  # Token creation factories
│       └── managers/   # Token management utilities
├── cli/            # Command-line interface
│   └── src/
│       └── commands/   # CLI command implementations
└── ui/             # Web interface
    └── src/
        ├── app/        # Next.js app directory
        └── components/ # React components
```

## 🔧 Development

Each package can be developed independently:

```bash
# Enter a specific package
cd packages/core  # or sdk, cli, ui

# Install package-specific dependencies
pnpm install

# Start development
pnpm dev
```

## ⚠️ Development Status

This project is currently **scaffolded** and ready for implementation. The actual functionality depends on:

- Token-2022 program stabilization
- SRFC 37 specification finalization
- Solana Kit integration availability

## 📋 Implementation Roadmap

1. **Core Library** - Implement Token-2022 extension wrappers
2. **SDK Templates** - Create stablecoin and arcade token templates
3. **CLI Tool** - Build command-line interface
4. **Web UI** - Develop modern web interface
5. **Integration** - Connect with SRFC 37 when available

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement functionality in the appropriate package
4. Add tests and documentation
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Solana Token Extensions Documentation](https://solana.com/developers/guides/token-extensions)
- [Token-2022 Program](https://github.com/solana-program/token-2022)
- [SRFC Standards](https://github.com/solana-foundation/solana-rfcs)

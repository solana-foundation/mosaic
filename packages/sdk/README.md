# @mosaic/sdk

SDK with token templates for Stablecoin and Arcade tokens using Token-2022 extensions.

## Purpose

This package provides high-level templates and SDK functionality that uses the core libraries to implement specific token types:

- 🪙 **Token Templates**: Pre-configured templates for common token types
- 🏭 **Token Factories**: Easy creation of tokens with proper extension configurations
- 📚 **Documentation**: Usage examples and best practices
- 🔌 **Exports**: Ready-to-use functionality for CLI & UI packages

## Token Templates

### Stablecoin Template

Pre-configured for regulatory compliance:

- Default Account State with SRFC blocklist
- Metadata extension for token information
- Confidential Balances for privacy
- Pausable for emergency controls
- Permanent Delegate for regulatory actions

### Arcade Token Template

Optimized for gaming and loyalty programs:

- Default Account State with SRFC allowlist (programs and users)
- Rich metadata for gaming integration
- Permanent Delegate for game mechanics
- Pausable for administrative control

## Architecture

```
sdk/
├── templates/           # Token type templates
│   ├── stablecoin/     # Stablecoin configuration
│   └── arcade-token/   # Arcade token configuration
├── factories/          # Token creation factories
├── managers/           # Token management utilities
└── examples/           # Usage examples
```

## Dependencies

- `@mosaic/core` - Core Token-2022 wrapper functionality
- `@solana/web3.js`
- `@solana/spl-token`

## Development Status

⚠️ **Planned** - This package will provide:

- Template configurations for each token type
- Factory functions for easy token creation
- Management utilities for token operations
- Exported functionality for CLI and UI packages

# @mosaic/core

Core library for Token-2022 extensions with hooks for issuance and management.

## Purpose

This package provides a wrapper around Solana/Kit & Token-2022 program with:

- 🔧 **Extension Wrappers**: Type-safe interfaces for Token-2022 extensions
- 🪝 **Hooks**: React-like hooks for token operations 
- 🛠️ **Utilities**: Helper functions for common token operations
- 📋 **SRFC Support**: Integration with SRFC 37 standards (when ready)

## Target Extensions

### Stablecoin Extensions
- **Default Account State** - SRFC blocklist for compliance
- **Metadata** - On-chain token metadata
- **Confidential Balances** - Privacy-preserving transactions  
- **Pausable** - Emergency controls
- **Permanent Delegate** - Regulatory compliance features

### Arcade Token Extensions
- **Default Account State** - SRFC allowlist for programs and users
- **Metadata** - Rich on-chain metadata for gaming
- **Permanent Delegate** - Game mechanics control
- **Pausable** - Administrative controls

## Dependencies

- `@solana/web3.js`
- `@solana/spl-token`
- `@anza-xyz/kit` (when ready)

## Development Status

⚠️ **Planned** - This package will be implemented when:
- Token-2022 program is stable
- SRFC 37 specification is finalized
- Solana Kit integration is available 
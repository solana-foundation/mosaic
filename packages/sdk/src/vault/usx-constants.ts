/**
 * USX / YieldVault Devnet and Mainnet mint addresses.
 *
 * Source: StableHacks hackathon brief (Solstice Finance, March 2026)
 *   USX docs: https://docs.solstice.finance/solstice-for-users/usx
 */

import type { Address } from '@solana/kit';

// ─── Devnet ───────────────────────────────────────────────────────────────────

export const DEVNET_MINTS = {
    /** Devnet USDT collateral mint */
    USDT: '5dXXpWyZCCPhBHxmp79Du81t7t9oh7HacUW864ARFyft' as Address,
    /** Devnet USDC collateral mint */
    USDC: '8iBux2LRja1PhVZph8Rw4Hi45pgkaufNEiaZma5nTD5g' as Address,
    /** Devnet USX stablecoin mint */
    USX: '7QC4zjrKA6XygpXPQCKSS9BmAsEFDJR6awiHSdgLcDvS' as Address,
    /** Devnet eUSX yield-bearing receipt token mint */
    eUSX: 'Gkt9h4QWpPBDtbaF5HvYKCc87H5WCRTUtMf77HdTGHBt' as Address,
} as const;

// ─── Mainnet (placeholders — update when Solstice publishes mainnet addresses) ─

export const MAINNET_MINTS = {
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' as Address, // canonical USDT
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Address, // canonical USDC
    USX: '7QC4zjrKA6XygpXPQCKSS9BmAsEFDJR6awiHSdgLcDvS' as Address, // update when live
    eUSX: 'Gkt9h4QWpPBDtbaF5HvYKCc87H5WCRTUtMf77HdTGHBt' as Address, // update when live
} as const;

// ─── API constants ────────────────────────────────────────────────────────────

/** Solstice instruction API base URL (hackathon endpoint) */
export const USX_INSTRUCTIONS_API_URL = 'https://instructions.solstice.finance';

/** Instruction API path */
export const USX_INSTRUCTIONS_PATH = '/v1/instructions';

/** YieldVault unlock cooldown in seconds (7 days) */
export const YIELD_VAULT_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;

/** YieldVault documented net IRR (3-year average) in basis points */
export const YIELD_VAULT_APY_BPS = 1150; // 11.50%

/** Minimum for permissioned (direct) USX mint — $500k */
export const USX_PERMISSIONED_MINT_MIN_USD = 500_000;

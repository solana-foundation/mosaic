/**
 * USX Instruction API Client
 *
 * Wraps the Solstice Finance instruction API for minting USX, redeeming USX,
 * and interacting with the YieldVault (Lock/Unlock/Withdraw eUSX).
 *
 * The API returns serialized base64-encoded Solana instructions that you
 * combine with your wallet's signing logic and submit via @solana/kit.
 *
 * API reference: https://instructions.solstice.finance/docs/
 * Full docs:     https://docs.solstice.finance/solstice-for-builders/apis
 *
 * Authentication:
 *   Set USX_API_KEY in your .env.local (server-side only).
 *   In the app, route requests through /api/usx-instructions to keep the key safe.
 *
 * Vault usage pattern:
 *   1. Depositor sends USDC/USDT to vault
 *   2. Vault calls RequestMint → ConfirmMint  →  holds USX
 *   3. Yield tranche: vault calls Lock(amount) → receives eUSX → earns ~11.5% APY
 *   4. On withdrawal: Unlock(amount) → 7-day cooldown → Withdraw() → USX returned
 *   5. Redeem: RequestRedeem → ConfirmRedeem → USDC/USDT returned to depositor
 */

import type { Address } from '@solana/kit';
import { USX_INSTRUCTIONS_API_URL, USX_INSTRUCTIONS_PATH } from './usx-constants';

// ─── Instruction types ────────────────────────────────────────────────────────

export type UsxInstructionType =
    | 'RequestMint'
    | 'ConfirmMint'
    | 'CancelMint'
    | 'RequestRedeem'
    | 'ConfirmRedeem'
    | 'CancelRedeem'
    | 'Lock'
    | 'Unlock'
    | 'Withdraw';

export type UsxCollateral = 'usdt' | 'usdc';

// ─── Request shapes ───────────────────────────────────────────────────────────

export interface UsxMintRequest {
    type: 'RequestMint';
    data: {
        /** Amount in UI units (e.g., 1000 = $1,000 USDC) */
        amount: number;
        collateral: UsxCollateral;
        user: Address;
    };
}

export interface UsxConfirmMintRequest {
    type: 'ConfirmMint';
    data: {
        collateral: UsxCollateral;
        user: Address;
    };
}

export interface UsxCancelMintRequest {
    type: 'CancelMint';
    data: {
        collateral: UsxCollateral;
        user: Address;
    };
}

export interface UsxRedeemRequest {
    type: 'RequestRedeem';
    data: {
        amount: number;
        collateral: UsxCollateral;
        user: Address;
    };
}

export interface UsxConfirmRedeemRequest {
    type: 'ConfirmRedeem';
    data: {
        collateral: UsxCollateral;
        user: Address;
    };
}

export interface UsxCancelRedeemRequest {
    type: 'CancelRedeem';
    data: {
        collateral: UsxCollateral;
        user: Address;
    };
}

export interface UsxLockRequest {
    type: 'Lock';
    data: {
        /** Amount of USX to lock into YieldVault (UI units) */
        amount: number;
        user: Address;
    };
}

export interface UsxUnlockRequest {
    type: 'Unlock';
    data: {
        /** Amount of eUSX to unlock (starts 7-day cooldown) */
        amount: number;
        user: Address;
    };
}

export interface UsxWithdrawRequest {
    type: 'Withdraw';
    data: {
        /** User whose cooldown has completed */
        user: Address;
    };
}

export type UsxInstructionRequest =
    | UsxMintRequest
    | UsxConfirmMintRequest
    | UsxCancelMintRequest
    | UsxRedeemRequest
    | UsxConfirmRedeemRequest
    | UsxCancelRedeemRequest
    | UsxLockRequest
    | UsxUnlockRequest
    | UsxWithdrawRequest;

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface UsxInstructionResponse {
    /** Base64-encoded serialized Solana instruction */
    instruction: string;
    /** Slot at which the instruction was generated */
    slot?: number;
    /** Account addresses required by the instruction */
    accounts?: string[];
    /** Program ID for verification */
    programId?: string;
    /** Additional metadata from the API */
    [key: string]: unknown;
}

export interface UsxClientError {
    error: string;
    code?: string;
    status: number;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class UsxClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(apiKey: string, baseUrl = USX_INSTRUCTIONS_API_URL) {
        if (!apiKey) throw new Error('USX API key is required');
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    /**
     * Sends an instruction request to the Solstice API and returns
     * the base64-encoded Solana instruction.
     *
     * @param request - Typed instruction request
     * @returns UsxInstructionResponse with base64 instruction data
     * @throws Error with status code and message on API failure
     */
    async getInstruction(request: UsxInstructionRequest): Promise<UsxInstructionResponse> {
        const url = `${this.baseUrl}${USX_INSTRUCTIONS_PATH}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify(request),
        });

        if (!res.ok) {
            let errorBody: UsxClientError;
            try {
                errorBody = await res.json() as UsxClientError;
            } catch {
                errorBody = { error: res.statusText, status: res.status };
            }
            throw new Error(
                `USX API error ${res.status}: ${errorBody.error}${errorBody.code ? ` (${errorBody.code})` : ''}`,
            );
        }

        return res.json() as Promise<UsxInstructionResponse>;
    }

    // ─── Convenience wrappers ─────────────────────────────────────────────────

    /** Step 1 of mint: initiate USX mint with USDC or USDT collateral */
    requestMint(amount: number, collateral: UsxCollateral, user: Address) {
        return this.getInstruction({ type: 'RequestMint', data: { amount, collateral, user } });
    }

    /** Step 2 of mint: confirm and receive USX */
    confirmMint(collateral: UsxCollateral, user: Address) {
        return this.getInstruction({ type: 'ConfirmMint', data: { collateral, user } });
    }

    /** Cancel a pending mint */
    cancelMint(collateral: UsxCollateral, user: Address) {
        return this.getInstruction({ type: 'CancelMint', data: { collateral, user } });
    }

    /** Step 1 of redeem: initiate USX → USDC/USDT redemption */
    requestRedeem(amount: number, collateral: UsxCollateral, user: Address) {
        return this.getInstruction({ type: 'RequestRedeem', data: { amount, collateral, user } });
    }

    /** Step 2 of redeem: confirm and receive collateral back */
    confirmRedeem(collateral: UsxCollateral, user: Address) {
        return this.getInstruction({ type: 'ConfirmRedeem', data: { collateral, user } });
    }

    /** Cancel a pending redeem */
    cancelRedeem(collateral: UsxCollateral, user: Address) {
        return this.getInstruction({ type: 'CancelRedeem', data: { collateral, user } });
    }

    /** Lock USX into YieldVault — receive eUSX, start earning yield */
    lock(amount: number, user: Address) {
        return this.getInstruction({ type: 'Lock', data: { amount, user } });
    }

    /**
     * Unlock eUSX from YieldVault — starts 7-day cooldown.
     * No yield accrues during cooldown period.
     */
    unlock(amount: number, user: Address) {
        return this.getInstruction({ type: 'Unlock', data: { amount, user } });
    }

    /** Withdraw USX after cooldown completes (call after 7 days post-Unlock) */
    withdraw(user: Address) {
        return this.getInstruction({ type: 'Withdraw', data: { user } });
    }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _usxClientInstance: UsxClient | null = null;

/**
 * Returns a cached UsxClient singleton configured from environment variables.
 * Server-side only — reads USX_API_KEY from process.env.
 *
 * Required env var:
 *   USX_API_KEY  — API key from Solstice Finance
 *
 * Optional:
 *   USX_API_URL  — Override the base URL (defaults to instructions.solstice.finance)
 */
export function getUsxClient(): UsxClient {
    if (_usxClientInstance) return _usxClientInstance;

    const apiKey = typeof process !== 'undefined' ? process.env['USX_API_KEY'] ?? '' : '';
    const baseUrl = typeof process !== 'undefined'
        ? process.env['USX_API_URL'] ?? USX_INSTRUCTIONS_API_URL
        : USX_INSTRUCTIONS_API_URL;

    if (!apiKey) {
        // Return a non-functional client that throws on use — allows type-safe usage
        // without crashing the server on import
        console.warn('[USX] USX_API_KEY not set. Configure it in .env.local to enable vault yield.');
    }

    _usxClientInstance = new UsxClient(apiKey || 'not-configured', baseUrl);
    return _usxClientInstance;
}

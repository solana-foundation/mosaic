import type { CrossBorderTransferParams, CrossBorderTransferResult } from './types';

// ─── FX Rate Simulation ───────────────────────────────────────────────────────
// In production, integrate SIX Financial Data or a Pyth FX price feed.

/** Simulated spot FX rates to USD (updated via oracle in production) */
const SIMULATED_FX_RATES: Record<string, number> = {
    USD: 1.0,
    EUR: 1.0827,
    GBP: 1.2710,
    JPY: 0.0066,
    SGD: 0.7380,
    CHF: 1.1240,
    AED: 0.2723,
    HKD: 0.1282,
    CAD: 0.7330,
    AUD: 0.6410,
};

/**
 * Returns the simulated FX rate for converting `from` → `to`.
 * Rate is expressed as "1 unit of `from` = X units of `to`".
 */
export function getSimulatedFxRate(from: string, to: string): number {
    const fromUsd = SIMULATED_FX_RATES[from.toUpperCase()] ?? 1.0;
    const toUsd = SIMULATED_FX_RATES[to.toUpperCase()] ?? 1.0;
    return fromUsd / toUsd;
}

// ─── Settlement Rail Helpers ──────────────────────────────────────────────────

const SETTLEMENT_TIMES: Record<string, number> = {
    solana_spl: 1,       // ~400ms finality, report as 1 second
    swift_sim: 86400,    // T+1 business day
    sepa_sim: 3600,      // SEPA Instant: within 1 hour
    iso20022_sim: 7200,  // ISO 20022 compliant: ~2 hours
};

// ─── Cross-Border Transfer Builder ───────────────────────────────────────────

/**
 * Builds the compliance memo payload and metadata for a cross-border transfer.
 *
 * This function does NOT submit any transactions. It returns the memo string
 * that should be attached to the SPL Memo instruction alongside the token
 * transfer, plus metadata useful for display/logging.
 *
 * For transfers above the Travel Rule threshold, the memo includes VASP
 * originator/beneficiary data per FATF Recommendation 16.
 *
 * @param params - Cross-border transfer configuration
 * @param travelRuleThresholdBaseUnits - Amount above which VASP data is required
 * @returns CrossBorderTransferResult with memo and metadata
 */
export function buildCrossBorderTransferMemo(
    params: CrossBorderTransferParams,
    travelRuleThresholdBaseUnits: bigint,
): CrossBorderTransferResult {
    const fxRate = params.fxRate ?? getSimulatedFxRate(
        params.sourceCurrency,
        params.destinationCurrency,
    );

    const rail = params.rail ?? 'solana_spl';
    const settlementSeconds = SETTLEMENT_TIMES[rail] ?? 1;
    const travelRuleRequired = params.amount >= travelRuleThresholdBaseUnits;

    const memoPayload: Record<string, unknown> = {
        v: 1,
        type: 'cross_border_transfer',
        rail,
        src_currency: params.sourceCurrency,
        dst_currency: params.destinationCurrency,
        fx_rate: fxRate,
        purpose: params.purposeCode ?? 'TRAD',
        timestamp: new Date().toISOString(),
    };

    if (params.senderBic) memoPayload['sender_bic'] = params.senderBic;
    if (params.receiverBic) memoPayload['receiver_bic'] = params.receiverBic;

    if (travelRuleRequired) {
        // Attach minimal Travel Rule fields per FATF R.16
        // Full implementation would include legal name, account number, LEI, etc.
        memoPayload['travel_rule'] = {
            originator_vasp: params.senderBic ?? 'UNKNOWN',
            beneficiary_vasp: params.receiverBic ?? 'UNKNOWN',
            threshold_exceeded: true,
        };
    }

    const memoData = JSON.stringify(memoPayload);

    return {
        memoData,
        settlementSeconds,
        fxRate,
        travelRuleAttached: travelRuleRequired,
    };
}

/**
 * Returns a human-readable summary of the cross-border transfer.
 */
export function formatCrossBorderSummary(
    params: CrossBorderTransferParams,
    result: CrossBorderTransferResult,
    decimals: number,
): string {
    const amount = (Number(params.amount) / 10 ** decimals).toFixed(2);
    const converted = (Number(params.amount) / 10 ** decimals * result.fxRate).toFixed(2);
    const settlementStr =
        result.settlementSeconds < 60
            ? `${result.settlementSeconds}s`
            : result.settlementSeconds < 3600
              ? `${(result.settlementSeconds / 60).toFixed(0)}m`
              : `${(result.settlementSeconds / 3600).toFixed(0)}h`;

    return [
        `Cross-Border Transfer`,
        `  Amount: ${amount} ${params.sourceCurrency} → ${converted} ${params.destinationCurrency}`,
        `  FX Rate: 1 ${params.sourceCurrency} = ${result.fxRate.toFixed(4)} ${params.destinationCurrency}`,
        `  Rail: ${params.rail ?? 'solana_spl'}`,
        `  Settlement: ~${settlementStr}`,
        `  Travel Rule: ${result.travelRuleAttached ? 'Attached (threshold exceeded)' : 'Not required'}`,
    ].join('\n');
}

/**
 * Travel Rule Compliance (FATF Recommendation 16 / FinCEN / MAS)
 *
 * For transfers above the configured threshold, originator/beneficiary VASP data
 * must be collected and transmitted. On Solana we simulate this by attaching
 * structured JSON to the SPL Memo instruction that accompanies the token transfer.
 *
 * In production, the memo would be a signed JWT from a VASP compliance hub
 * (e.g., Notabene, Sygna, TRP protocol).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaspInfo {
    /** Legal entity name */
    legalName: string;
    /** SWIFT BIC code */
    bic?: string;
    /** LEI (Legal Entity Identifier) */
    lei?: string;
    /** Country (ISO 3166-1 alpha-2) */
    country: string;
}

export interface TravelRuleOriginatorData {
    vasp: VaspInfo;
    /** Natural person or legal entity name */
    accountHolderName: string;
    /** Account identifier (e.g., on-chain address or account ref) */
    accountIdentifier: string;
    /** Geographic address (optional but recommended) */
    address?: string;
    /** National ID type (e.g., "passport", "national_id") */
    nationalIdType?: string;
    /** National ID number (should be hashed in production) */
    nationalIdNumber?: string;
}

export interface TravelRuleBeneficiaryData {
    vasp: VaspInfo;
    accountHolderName: string;
    accountIdentifier: string;
}

export interface TravelRulePayload {
    /** Schema version */
    v: number;
    /** ISO-8601 timestamp */
    timestamp: string;
    /** Transfer amount in token base units */
    amountBaseUnits: string;
    originator: TravelRuleOriginatorData;
    beneficiary: TravelRuleBeneficiaryData;
    /** Protocol used: "ivms101" | "trp" | "notabene" | "mosaic_sim" */
    protocol: string;
}

export interface TravelRuleResult {
    /** Whether Travel Rule data is required for this amount */
    required: boolean;
    /** The memo string to attach (undefined if not required) */
    memoData?: string;
    /** Threshold that was applied (in base units) */
    thresholdBaseUnits: bigint;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default FATF Travel Rule threshold: $1,000 USD equivalent (in 6-decimal base units) */
export const DEFAULT_TRAVEL_RULE_THRESHOLD_BASE_UNITS = 1_000_000_000n;

/** FinCEN threshold: $3,000 */
export const FINCEN_TRAVEL_RULE_THRESHOLD_BASE_UNITS = 3_000_000_000n;

/** MAS (Singapore) threshold: SGD 1,500 */
export const MAS_TRAVEL_RULE_THRESHOLD_BASE_UNITS = 1_500_000_000n;

// ─── Core Function ────────────────────────────────────────────────────────────

/**
 * Builds a Travel Rule compliance payload for a token transfer.
 *
 * Returns the JSON memo string to attach to the SPL Memo instruction.
 * If the transfer amount is below the threshold, returns `required: false`
 * and no memo is generated.
 *
 * @param amountBaseUnits - Transfer amount in token base units
 * @param originator - Sending VASP and account holder data
 * @param beneficiary - Receiving VASP and account holder data
 * @param thresholdBaseUnits - Minimum amount requiring Travel Rule (default: $1,000)
 * @returns TravelRuleResult
 */
export function buildTravelRulePayload(
    amountBaseUnits: bigint,
    originator: TravelRuleOriginatorData,
    beneficiary: TravelRuleBeneficiaryData,
    thresholdBaseUnits = DEFAULT_TRAVEL_RULE_THRESHOLD_BASE_UNITS,
): TravelRuleResult {
    if (amountBaseUnits < thresholdBaseUnits) {
        return { required: false, thresholdBaseUnits };
    }

    const payload: TravelRulePayload = {
        v: 1,
        timestamp: new Date().toISOString(),
        amountBaseUnits: amountBaseUnits.toString(),
        originator,
        beneficiary,
        protocol: 'mosaic_sim', // Replace with 'ivms101' for production
    };

    return {
        required: true,
        memoData: JSON.stringify(payload),
        thresholdBaseUnits,
    };
}

/**
 * Parses a Travel Rule memo string back into a structured payload.
 * Returns null if the string is not a valid Travel Rule payload.
 */
export function parseTravelRuleMemo(memo: string): TravelRulePayload | null {
    try {
        const parsed = JSON.parse(memo) as Partial<TravelRulePayload>;
        if (parsed.v === 1 && parsed.originator && parsed.beneficiary) {
            return parsed as TravelRulePayload;
        }
        return null;
    } catch {
        return null;
    }
}

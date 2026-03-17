/**
 * SIX Financial Data – Instrument Registry
 *
 * Maps currency pairs and precious metals to their SIX VALOR and BC codes.
 * Data sourced from the SIX Web API instrument list provided for StableHacks.
 *
 * VALOR_BC format: `<valor>_<bc>` (e.g. "946681_148")
 * BC 148 = SIX reference price segment
 *
 * Usage:
 *   import { SIX_INSTRUMENTS, getInstrumentByPair } from './six-instruments';
 *   const eur = getInstrumentByPair('EUR', 'USD');
 *   // { valor: 946681, bc: 148, ticker: 'EUR/USD', name: 'Euro / US-Dollar', kind: 'fx' }
 */

export type InstrumentKind = 'fx' | 'metal' | 'crypto';

export interface SixInstrument {
    /** SIX VALOR identifier */
    valor: number;
    /** Market segment (148 = SIX reference price) */
    bc: number;
    /** Human-readable name */
    name: string;
    /** Short ticker */
    ticker: string;
    /** Instrument category */
    kind: InstrumentKind;
    /**
     * For FX: base currency (e.g. "EUR" in EUR/USD)
     * For metals: commodity symbol (e.g. "XAU")
     */
    base: string;
    /**
     * For FX: quote currency (e.g. "USD" in EUR/USD)
     * For metals: unit currency (typically "USD")
     */
    quote: string;
}

// ─── FX Majors ────────────────────────────────────────────────────────────────

export const SIX_FX_MAJORS: SixInstrument[] = [
    { valor: 946681,  bc: 148, name: 'Euro / US-Dollar',           ticker: 'EUR/USD', kind: 'fx', base: 'EUR', quote: 'USD' },
    { valor: 275017,  bc: 148, name: 'British Pound / US-Dollar',  ticker: 'GBP/USD', kind: 'fx', base: 'GBP', quote: 'USD' },
    { valor: 275000,  bc: 148, name: 'US-Dollar / Swiss Franc',    ticker: 'USD/CHF', kind: 'fx', base: 'USD', quote: 'CHF' },
    { valor: 275001,  bc: 148, name: 'US-Dollar / Japanese Yen',   ticker: 'USD/JPY', kind: 'fx', base: 'USD', quote: 'JPY' },
    { valor: 275129,  bc: 148, name: 'US-Dollar / Singapore Dollar', ticker: 'USD/SGD', kind: 'fx', base: 'USD', quote: 'SGD' },
    { valor: 275002,  bc: 148, name: 'US-Dollar / Canadian Dollar', ticker: 'USD/CAD', kind: 'fx', base: 'USD', quote: 'CAD' },
    { valor: 275003,  bc: 148, name: 'US-Dollar / Australian Dollar', ticker: 'USD/AUD', kind: 'fx', base: 'USD', quote: 'AUD' },
    { valor: 275004,  bc: 148, name: 'US-Dollar / New Zealand Dollar', ticker: 'USD/NZD', kind: 'fx', base: 'USD', quote: 'NZD' },
    { valor: 275127,  bc: 148, name: 'US-Dollar / South African Rand', ticker: 'USD/ZAR', kind: 'fx', base: 'USD', quote: 'ZAR' },
    { valor: 275157,  bc: 148, name: 'US-Dollar / Chinese Renminbi', ticker: 'USD/CNY', kind: 'fx', base: 'USD', quote: 'CNY' },
    { valor: 275220,  bc: 148, name: 'US-Dollar / South Korean Won', ticker: 'USD/KRW', kind: 'fx', base: 'USD', quote: 'KRW' },
    { valor: 275161,  bc: 148, name: 'US-Dollar / Colombian Peso', ticker: 'USD/COP', kind: 'fx', base: 'USD', quote: 'COP' },
    { valor: 286317,  bc: 148, name: 'US-Dollar / Brazilian Real',  ticker: 'USD/BRL', kind: 'fx', base: 'USD', quote: 'BRL' },
    { valor: 28388,   bc: 148, name: 'US-Dollar / Mexican Peso',    ticker: 'USD/MXN', kind: 'fx', base: 'USD', quote: 'MXN' },
    { valor: 275163,  bc: 148, name: 'US-Dollar / Argentine Peso',  ticker: 'USD/ARS', kind: 'fx', base: 'USD', quote: 'ARS' },
    { valor: 275006,  bc: 148, name: 'US-Dollar / UAE Dirham',      ticker: 'USD/AED', kind: 'fx', base: 'USD', quote: 'AED' },
    { valor: 275007,  bc: 148, name: 'US-Dollar / Hong Kong Dollar', ticker: 'USD/HKD', kind: 'fx', base: 'USD', quote: 'HKD' },
    { valor: 275008,  bc: 148, name: 'US-Dollar / Indian Rupee',    ticker: 'USD/INR', kind: 'fx', base: 'USD', quote: 'INR' },
    { valor: 275009,  bc: 148, name: 'US-Dollar / Thai Baht',       ticker: 'USD/THB', kind: 'fx', base: 'USD', quote: 'THB' },
    { valor: 275010,  bc: 148, name: 'Euro / Swiss Franc',          ticker: 'EUR/CHF', kind: 'fx', base: 'EUR', quote: 'CHF' },
    { valor: 275011,  bc: 148, name: 'Euro / British Pound',        ticker: 'EUR/GBP', kind: 'fx', base: 'EUR', quote: 'GBP' },
    { valor: 275012,  bc: 148, name: 'Euro / Japanese Yen',         ticker: 'EUR/JPY', kind: 'fx', base: 'EUR', quote: 'JPY' },
];

// ─── Precious Metals (spot, USD per troy oz) ──────────────────────────────────

export const SIX_METALS: SixInstrument[] = [
    { valor: 274702, bc: 148, name: 'Gold 1 Oz',      ticker: 'XAU/USD', kind: 'metal', base: 'XAU', quote: 'USD' },
    { valor: 274720, bc: 148, name: 'Silver 1 Oz',    ticker: 'XAG/USD', kind: 'metal', base: 'XAG', quote: 'USD' },
    { valor: 283501, bc: 148, name: 'Palladium 1 Oz', ticker: 'XPD/USD', kind: 'metal', base: 'XPD', quote: 'USD' },
    { valor: 287635, bc: 148, name: 'Platinum 1 Oz',  ticker: 'XPT/USD', kind: 'metal', base: 'XPT', quote: 'USD' },
];

// ─── Combined registry ────────────────────────────────────────────────────────

export const SIX_INSTRUMENTS: SixInstrument[] = [
    ...SIX_FX_MAJORS,
    ...SIX_METALS,
];

/** Index by VALOR_BC key (e.g. "946681_148") */
export const SIX_BY_VALOR_BC: Record<string, SixInstrument> = Object.fromEntries(
    SIX_INSTRUMENTS.map(i => [`${i.valor}_${i.bc}`, i]),
);

/** Index by ticker (e.g. "EUR/USD") */
export const SIX_BY_TICKER: Record<string, SixInstrument> = Object.fromEntries(
    SIX_INSTRUMENTS.map(i => [i.ticker, i]),
);

/**
 * Find instrument by base/quote currency pair.
 * Handles both directions: getInstrumentByPair('EUR','USD') and ('USD','EUR').
 */
export function getInstrumentByPair(base: string, quote: string): SixInstrument | undefined {
    const direct = SIX_BY_TICKER[`${base}/${quote}`];
    if (direct) return direct;
    // Try inverse direction
    return SIX_BY_TICKER[`${quote}/${base}`];
}

/**
 * Returns all FX instruments involving a specific currency.
 */
export function getInstrumentsByCurrency(currency: string): SixInstrument[] {
    return SIX_INSTRUMENTS.filter(
        i => i.kind === 'fx' && (i.base === currency || i.quote === currency),
    );
}

/**
 * Vault-relevant instrument subset: major FX crosses + all metals.
 * Used as the default subscription list for the Treasury Vault oracle.
 */
export const VAULT_INSTRUMENT_SUBSCRIPTION: SixInstrument[] = [
    ...SIX_FX_MAJORS.filter(i =>
        ['EUR/USD', 'GBP/USD', 'USD/CHF', 'USD/JPY', 'USD/SGD', 'USD/AED', 'USD/HKD', 'USD/CAD', 'USD/AUD',
         'USD/ZAR', 'USD/CNY', 'USD/BRL', 'USD/MXN'].includes(i.ticker),
    ),
    ...SIX_METALS,
];

import { isAddress } from '@solana/kit';

/**
 * Throws if any named field holds a non-empty value that isn't a valid Solana address.
 *
 * The creation libs cast every authority option straight to `Address`, so without this an
 * unparseable string surfaces as an opaque failure from deep inside `@solana/kit` — or worse,
 * as a rejected transaction. Empty values are legal: they mean "default to the connected
 * wallet".
 *
 * @param options - the form options object
 * @param labels - field name → human label used in the error message
 */
export function assertValidAddressFields<TOptions extends object>(
    options: TOptions,
    labels: Partial<Record<Extract<keyof TOptions, string>, string>>,
): void {
    for (const [field, label] of Object.entries(labels)) {
        const raw = (options as Record<string, unknown>)[field];
        if (typeof raw !== 'string') continue;
        const trimmed = raw.trim();
        if (trimmed.length === 0) continue;
        if (!isAddress(trimmed)) {
            throw new Error(`${label} must be a valid Solana address`);
        }
    }
}

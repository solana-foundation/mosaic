import { isAddress, type Address } from '@solana/kit';

/**
 * Trims an authority input and returns `undefined` when nothing is left.
 *
 * Every authority is optional, and a blank field means "default to the connected wallet".
 * Casting the raw string instead would let whitespace through in two ways: `'   '` is truthy,
 * so it reaches the SDK as a real authority, and a padded address keeps its padding — both
 * surfacing as `SolanaError: Expected base58-encoded address string …` with no field name.
 * Use this for every authority cast so the trimmed value is also the validated one.
 */
export function toAuthorityAddress(raw: string | undefined): Address | undefined {
    const trimmed = raw?.trim();
    return trimmed ? (trimmed as Address) : undefined;
}

/**
 * Throws if any named field holds a non-empty value that isn't a valid Solana address.
 *
 * The creation libs cast every authority option straight to `Address`, so without this an
 * unparseable string surfaces as an opaque failure from deep inside `@solana/kit` — or worse,
 * as a rejected transaction. Empty values are legal: they mean "default to the connected
 * wallet".
 *
 * Pass only the fields that are actually in play. An authority belonging to a disabled
 * extension is never read by the SDK, so validating it would reject a value the mint would
 * have ignored — and the form has already hidden the input, leaving the user nothing to fix.
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

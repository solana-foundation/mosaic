import { address, type Address } from '@solana/kit';

export function parseConfidentialTransferAddress(value: string | undefined, name: string): Address {
    const trimmed = value?.trim();
    if (!trimmed) {
        throw new Error(`${name} is required`);
    }

    try {
        return address(trimmed);
    } catch {
        throw new Error(`${name} must be a valid Solana address`);
    }
}

export function parseOptionalConfidentialTransferAddress(value: string | undefined, name: string): Address | undefined {
    return value?.trim() ? parseConfidentialTransferAddress(value, name) : undefined;
}

export function parseConfidentialTransferSourceAccounts(
    value: string | string[] | undefined,
    options: {
        required?: boolean;
        name?: string;
    } = {},
): Address[] {
    const values = value ? (Array.isArray(value) ? value : [value]) : [];
    const sources = values
        .flatMap(source => source.split(','))
        .map(source => source.trim())
        .filter(Boolean)
        .map((source, index) => parseConfidentialTransferAddress(source, `${options.name ?? 'source'} ${index + 1}`));

    if (options.required && sources.length === 0) {
        throw new Error(`At least one ${options.name ?? 'source token account'} is required`);
    }

    return sources;
}

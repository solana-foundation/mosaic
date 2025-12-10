/**
 * Centralized error handling utilities for the application.
 * Provides consistent error message extraction and categorization.
 */

/**
 * Error messages that should be silently ignored (not shown to user).
 * These typically represent expected states rather than actual errors.
 *
 * Patterns can be:
 * - Exact strings: matched with case-insensitive === comparison
 * - RegExp objects: tested against the full message with .test()
 */
export const SILENT_ERROR_PATTERNS: (string | RegExp)[] = [
    // Exact string matches (case-insensitive)
    'Mint account not found',
    'Not a Token-2022 mint',
    // RegExp patterns with word boundaries for precise matching
    // Example: /\bMint account not found\b/i for case-insensitive word-boundary matching
];

/**
 * Extracts a human-readable message from an unknown error.
 * @param error - The error to extract the message from
 * @param fallback - Fallback message if extraction fails
 * @returns A string error message
 */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return fallback;
}

/**
 * Checks if an error should be silently ignored based on known patterns.
 * Useful for expected error states that don't need user notification.
 *
 * String patterns are matched exactly (case-insensitive).
 * RegExp patterns are tested against the full message.
 * @param error - The error to check
 * @returns true if the error should be ignored
 */
export function isSilentError(error: unknown): boolean {
    const message = getErrorMessage(error, '');
    return SILENT_ERROR_PATTERNS.some(pattern => {
        if (typeof pattern === 'string') {
            // Exact string match (case-insensitive)
            return message.toLowerCase() === pattern.toLowerCase();
        } else {
            // RegExp pattern test
            return pattern.test(message);
        }
    });
}

/**
 * Handles an error by extracting the message and optionally calling a setter.
 * Silently ignores errors that match known patterns.
 * @param error - The error to handle
 * @param setError - Optional callback to set the error message
 * @param fallback - Fallback message if extraction fails
 * @returns The error message (empty string if silently ignored)
 */
export function handleError(
    error: unknown,
    setError?: (message: string) => void,
    fallback = 'An unexpected error occurred',
): string {
    if (isSilentError(error)) {
        return '';
    }

    const message = getErrorMessage(error, fallback);
    if (setError) {
        setError(message);
    }
    return message;
}

/**
 * Creates an error handler function with a preset fallback message.
 * Useful for creating context-specific error handlers.
 * @param fallback - The fallback message for this context
 * @returns A function that handles errors with the preset fallback
 */
export function createErrorHandler(fallback: string) {
    return (error: unknown, setError?: (message: string) => void): string => {
        return handleError(error, setError, fallback);
    };
}

/**
 * Mappings from technical SDK/validation error patterns to user-friendly messages.
 * Patterns are tested in order; first match wins.
 */
const ERROR_MAPPINGS: Array<{ pattern: RegExp; message: string }> = [
    // Permanent delegate errors
    {
        pattern: /does not have permanent delegate extension/i,
        message: 'This token does not have permanent delegate authority configured.',
    },
    {
        pattern: /Permanent delegate mismatch/i,
        message: 'Your wallet is not the permanent delegate authority for this token.',
    },

    // Mint/authority errors
    {
        pattern: /Mint account .* not found/i,
        message: 'Token not found. Please verify the token address.',
    },
    {
        pattern: /Token account does not exist/i,
        message: 'No token account found for this wallet.',
    },
    {
        pattern: /Insufficient token balance/i,
        message: 'Insufficient balance for this operation.',
    },
    {
        pattern: /must have a zero balance/i,
        message: 'Token account must have zero balance before closing.',
    },

    // Pause errors
    { pattern: /already paused/i, message: 'This token is already paused.' },
    { pattern: /not paused/i, message: 'This token is not currently paused.' },

    // ACL errors
    { pattern: /not an ABL blocklist/i, message: 'This token does not support blocklist operations.' },
    { pattern: /not an ABL allowlist/i, message: 'This token does not support allowlist operations.' },

    // Generic validation
    { pattern: /Invalid.*address format/i, message: 'Please enter a valid Solana address.' },
    { pattern: /Amount must be.*positive/i, message: 'Please enter an amount greater than zero.' },
];

/**
 * Translates technical SDK/validation errors into user-friendly messages.
 * Falls back to the original message if no mapping is found.
 * @param error - The error to humanize
 * @param fallback - Fallback message if extraction fails
 * @returns A user-friendly error message
 */
export function humanizeError(error: unknown, fallback = 'An unexpected error occurred'): string {
    if (isSilentError(error)) {
        return '';
    }

    const message = getErrorMessage(error, fallback);

    for (const { pattern, message: humanMessage } of ERROR_MAPPINGS) {
        if (pattern.test(message)) {
            return humanMessage;
        }
    }

    return message;
}

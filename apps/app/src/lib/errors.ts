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

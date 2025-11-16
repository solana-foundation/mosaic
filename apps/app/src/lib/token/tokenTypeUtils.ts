import type { TokenType } from '@mosaic/sdk';

/**
 * Token type utilities for display and categorization
 */

export const TOKEN_TYPE_LABELS: Record<string, string> = {
    stablecoin: 'Stablecoin',
    'arcade-token': 'Arcade Token',
    'tokenized-security': 'Tokenized Security',
    unknown: 'Unknown',
};

/**
 * Get a user-friendly label for a token type
 */
export function getTokenTypeLabel(type?: string): string {
    if (!type) return 'Unknown';
    return TOKEN_TYPE_LABELS[type] || type;
}

/**
 * Get a display label that shows all matching patterns
 * Examples: "Stablecoin", "Stablecoin + Security", "Arcade Token"
 */
export function getTokenPatternsLabel(primaryType?: string, patterns?: TokenType[]): string {
    // If no patterns, fall back to primary type
    if (!patterns || patterns.length === 0) {
        return getTokenTypeLabel(primaryType);
    }

    // If single pattern, just return its label
    if (patterns.length === 1) {
        return getTokenTypeLabel(patterns[0]);
    }

    // Multiple patterns - show primary + count
    const primaryLabel = getTokenTypeLabel(patterns[0]);
    return `${primaryLabel} +${patterns.length - 1}`;
}

/**
 * Get a badge color class based on token type
 */
export function getTokenTypeBadgeColor(type?: string): string {
    switch (type) {
        case 'stablecoin':
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
        case 'arcade-token':
            return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
        case 'tokenized-security':
            return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
}

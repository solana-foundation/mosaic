/**
 * Did the user dismiss the wallet prompt, rather than the signer refusing the
 * message outright? A cancellation must not be reported as an incompatibility.
 */
export function isSignerRejection(error: unknown): boolean {
    if ((error as { code?: unknown } | null)?.code === 4001) return true;
    return /reject|denied|declin|cancel/i.test(describeError(error));
}

export function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

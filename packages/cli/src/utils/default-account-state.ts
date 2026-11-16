/**
 * Whether new token accounts of a freshly created mint start Frozen, mirroring the SDK templates'
 * `withDefaultAccountState(aclMode === 'blocklist' || !enableSrfc37)`: only an sRFC-37 allowlist
 * mint starts accounts Frozen. Without sRFC-37 there is no list program to thaw members, so the
 * templates start every account Initialized, whatever the ACL mode. `aclMode` defaults to
 * blocklist as in the stablecoin and tokenized-security templates; arcade tokens pass allowlist.
 *
 * `enableSrfc37` is whatever the CLI handed the SDK, which tests it for truthiness.
 */
export function accountsStartFrozen(aclMode: string | undefined, enableSrfc37: unknown): boolean {
    return (aclMode ?? 'blocklist') !== 'blocklist' && Boolean(enableSrfc37);
}

/** The Default Account State line of a `create` summary, worded like the app's. */
export function defaultAccountStateLabel(frozen: boolean): string {
    return `Default Account State (${frozen ? 'Frozen' : 'Initialized'})`;
}

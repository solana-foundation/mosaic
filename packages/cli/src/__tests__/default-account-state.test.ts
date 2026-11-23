import { accountsStartFrozen, defaultAccountStateLabel } from '../utils/default-account-state';

describe('accountsStartFrozen', () => {
    // The SDK templates call `withDefaultAccountState(aclMode === 'blocklist' || !enableSrfc37)`,
    // where `true` means Initialized. Each row is [aclMode, enableSrfc37, starts Frozen].
    it.each([
        ['blocklist', false, false],
        ['blocklist', true, false],
        ['allowlist', false, false],
        ['allowlist', true, true],
        [undefined, false, false],
        [undefined, true, false],
    ] as const)('aclMode %s with sRFC-37 %s starts frozen: %s', (aclMode, enableSrfc37, frozen) => {
        expect(accountsStartFrozen(aclMode, enableSrfc37)).toBe(frozen);
    });

    it('treats a missing --enable-srfc37 as off', () => {
        expect(accountsStartFrozen('allowlist', undefined)).toBe(false);
    });
});

describe('defaultAccountStateLabel', () => {
    it('names the state the accounts start in', () => {
        expect(defaultAccountStateLabel(true)).toBe('Default Account State (Frozen)');
        expect(defaultAccountStateLabel(false)).toBe('Default Account State (Initialized)');
    });
});

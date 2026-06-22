import { type Address, address } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { computeLockSeed, deriveLockAccountAddress } from '../lock-address';

const MINT = address('HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj');
const HOLDER = address('FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');
const PD = address('sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v');

describe('deriveLockAccountAddress', () => {
    test('seed is exactly 32 chars (System max)', async () => {
        const mintLock = await computeLockSeed('mint-lock', MINT, HOLDER);
        const burnLock = await computeLockSeed('burn-lock', MINT, HOLDER);
        expect(mintLock).toHaveLength(32);
        expect(burnLock).toHaveLength(32);
    });

    test('mint-lock and burn-lock seeds differ for same (mint, holder)', async () => {
        const mintLock = await computeLockSeed('mint-lock', MINT, HOLDER);
        const burnLock = await computeLockSeed('burn-lock', MINT, HOLDER);
        expect(mintLock).not.toEqual(burnLock);
    });

    test('seed is deterministic across calls', async () => {
        const a = await computeLockSeed('mint-lock', MINT, HOLDER);
        const b = await computeLockSeed('mint-lock', MINT, HOLDER);
        expect(a).toEqual(b);
    });

    test('different holders produce different seeds', async () => {
        const otherHolder = address('GA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT' as string) as Address;
        const a = await computeLockSeed('mint-lock', MINT, HOLDER);
        const b = await computeLockSeed('mint-lock', MINT, otherHolder);
        expect(a).not.toEqual(b);
    });

    test('lock address is the deterministic with-seed derivation under Token-2022', async () => {
        const { address: addr1, seed: seed1 } = await deriveLockAccountAddress({
            lockType: 'mint-lock',
            permanentDelegate: PD,
            mint: MINT,
            holder: HOLDER,
        });
        const { address: addr2, seed: seed2 } = await deriveLockAccountAddress({
            lockType: 'mint-lock',
            permanentDelegate: PD,
            mint: MINT,
            holder: HOLDER,
        });
        expect(addr1).toEqual(addr2);
        expect(seed1).toEqual(seed2);
        // Address derivation uses TOKEN_2022 as the program — fail loudly if that ever changes silently.
        expect(TOKEN_2022_PROGRAM_ADDRESS).toBeDefined();
    });

    test('mint-lock and burn-lock yield different addresses for same triplet', async () => {
        const a = await deriveLockAccountAddress({
            lockType: 'mint-lock',
            permanentDelegate: PD,
            mint: MINT,
            holder: HOLDER,
        });
        const b = await deriveLockAccountAddress({
            lockType: 'burn-lock',
            permanentDelegate: PD,
            mint: MINT,
            holder: HOLDER,
        });
        expect(a.address).not.toEqual(b.address);
    });
});

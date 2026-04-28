import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { address } from '@solana/kit';
import { createMockRpc, createMockSigner, seedMintDetails } from '../../__tests__/test-utils';
import {
    AuthorityType,
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    extension,
    getFreezeAccountInstruction,
    getInitializeAccount3Instruction,
    getSetAuthorityInstruction,
    getThawAccountInstruction,
    getTokenSize,
    identifyToken2022Instruction,
} from '@solana-program/token-2022';
import {
    SYSTEM_PROGRAM_ADDRESS,
    getCreateAccountWithSeedInstruction,
} from '@solana-program/system';
import { createInitLockAccountTransaction } from '../init-lock-account';
import { deriveLockAccountAddress } from '../lock-address';

const MINT = address('HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj');
const HOLDER = address('FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');

const matchesIx = (a: Instruction, b: Instruction) =>
    a.programAddress === b.programAddress && Buffer.compare(Buffer.from(a.data ?? []), Buffer.from(b.data ?? [])) === 0;

describe('createInitLockAccountTransaction', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const pd = createMockSigner('sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v');

    beforeEach(() => {
        rpc = createMockRpc();
        // MMF mints carry transferHook + pausableConfig (and others), which require
        // matching account-side extensions. The init builder reads these via getMintDetails.
        seedMintDetails(rpc, {
            address: MINT,
            decimals: 6,
            extensions: [
                { extension: 'transferHook', state: {} },
                { extension: 'pausableConfig', state: {} },
                { extension: 'permanentDelegate', state: {} },
                { extension: 'defaultAccountState', state: {} },
                { extension: 'tokenMetadata', state: {} },
            ],
        });
    });

    test('emits createAccountWithSeed + initializeAccount3 + thaw + setAuthority(close) + setAuthority(owner) + freeze', async () => {
        const { transaction, lockAccount, seed } = await createInitLockAccountTransaction(rpc, {
            lockType: 'mint-lock',
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: pd,
            feePayer,
        });

        const expectedDerivation = await deriveLockAccountAddress({
            lockType: 'mint-lock',
            permanentDelegate: pd.address,
            mint: MINT,
            holder: HOLDER,
        });
        expect(lockAccount).toEqual(expectedDerivation.address);
        expect(seed).toEqual(expectedDerivation.seed);

        const ixs = transaction.instructions;
        expect(ixs).toHaveLength(6);

        // ix 0: System.CreateAccountWithSeed with space derived from the mint's extensions.
        // For an MMF mint (TransferHook + PausableConfig), required token-account extensions
        // are TransferHookAccount + PausableAccount → 175 bytes (requires
        // @solana-program/token-2022 ≥ 0.8.0; earlier versions had a codama bug that
        // under-counted PausableAccount by 2 bytes).
        const expectedSpace = BigInt(
            getTokenSize([
                extension('TransferHookAccount', { transferring: false }),
                extension('PausableAccount'),
            ]),
        );
        const expectedCreate = getCreateAccountWithSeedInstruction({
            payer: feePayer,
            newAccount: lockAccount,
            baseAccount: pd,
            base: pd.address,
            seed,
            amount: 2039280n,
            space: expectedSpace,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        });
        expect(ixs[0].programAddress).toEqual(SYSTEM_PROGRAM_ADDRESS);
        expect(matchesIx(ixs[0], expectedCreate)).toBe(true);

        // ix 1: Token-2022.InitializeAccount3 with owner = PD (auto-frozen via DAS)
        const expectedInit = getInitializeAccount3Instruction(
            { account: lockAccount, mint: MINT, owner: pd.address },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[1], expectedInit)).toBe(true);

        // ix 2: Thaw so SetAuthority can run (Token-2022 rejects SetAuthority on frozen accounts)
        const expectedThaw = getThawAccountInstruction(
            { account: lockAccount, mint: MINT, owner: pd },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[2], expectedThaw)).toBe(true);

        // ix 3: SetAuthority(CloseAccount, PD -> PD) - pin before owner flips
        const expectedSetClose = getSetAuthorityInstruction(
            {
                owned: lockAccount,
                owner: pd,
                authorityType: AuthorityType.CloseAccount,
                newAuthority: pd.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[3], expectedSetClose)).toBe(true);

        // ix 4: SetAuthority(AccountOwner, PD -> holder)
        const expectedSetOwner = getSetAuthorityInstruction(
            {
                owned: lockAccount,
                owner: pd,
                authorityType: AuthorityType.AccountOwner,
                newAuthority: HOLDER,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[4], expectedSetOwner)).toBe(true);

        // ix 5: Refreeze
        const expectedFreeze = getFreezeAccountInstruction(
            { account: lockAccount, mint: MINT, owner: pd },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[5], expectedFreeze)).toBe(true);

        // SetAuthority order matters: close-auth pin must precede owner change.
        expect(
            identifyToken2022Instruction(ixs[3].data ?? new Uint8Array()),
        ).toBe(Token2022Instruction.SetAuthority);
        expect(
            identifyToken2022Instruction(ixs[4].data ?? new Uint8Array()),
        ).toBe(Token2022Instruction.SetAuthority);
    });

    test('mint-lock and burn-lock produce different lockAccount addresses', async () => {
        const a = await createInitLockAccountTransaction(rpc, {
            lockType: 'mint-lock',
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: pd,
            feePayer,
        });
        const b = await createInitLockAccountTransaction(rpc, {
            lockType: 'burn-lock',
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: pd,
            feePayer,
        });
        expect(a.lockAccount).not.toEqual(b.lockAccount);
    });
});

import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { address } from '@solana/kit';
import { createMockRpc, createMockSigner } from '../../__tests__/test-utils';
import {
    AuthorityType,
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    getInitializeAccount3Instruction,
    getSetAuthorityInstruction,
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
    });

    test('emits createAccountWithSeed + initializeAccount3 + setAuthority(close) + setAuthority(owner)', async () => {
        const { transaction, lockAccount, seed } = await createInitLockAccountTransaction(rpc, {
            lockType: 'mint-lock',
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
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
        expect(ixs).toHaveLength(4);

        // ix 0: System.CreateAccountWithSeed
        const expectedCreate = getCreateAccountWithSeedInstruction({
            payer: feePayer,
            newAccount: lockAccount,
            baseAccount: pd,
            base: pd.address,
            seed,
            amount: 2039280n,
            space: 165n,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        });
        expect(ixs[0].programAddress).toEqual(SYSTEM_PROGRAM_ADDRESS);
        expect(matchesIx(ixs[0], expectedCreate)).toBe(true);

        // ix 1: Token-2022.InitializeAccount3 with owner = PD
        const expectedInit = getInitializeAccount3Instruction(
            { account: lockAccount, mint: MINT, owner: pd.address },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[1], expectedInit)).toBe(true);

        // ix 2: SetAuthority(CloseAccount, PD -> PD)
        const expectedSetClose = getSetAuthorityInstruction(
            {
                owned: lockAccount,
                owner: pd,
                authorityType: AuthorityType.CloseAccount,
                newAuthority: pd.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[2], expectedSetClose)).toBe(true);

        // ix 3: SetAuthority(AccountOwner, PD -> holder)
        const expectedSetOwner = getSetAuthorityInstruction(
            {
                owned: lockAccount,
                owner: pd,
                authorityType: AuthorityType.AccountOwner,
                newAuthority: HOLDER,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        );
        expect(matchesIx(ixs[3], expectedSetOwner)).toBe(true);

        // SetAuthority order matters: close-auth pin must precede owner change.
        expect(
            identifyToken2022Instruction(ixs[2].data ?? new Uint8Array()),
        ).toBe(Token2022Instruction.SetAuthority);
        expect(
            identifyToken2022Instruction(ixs[3].data ?? new Uint8Array()),
        ).toBe(Token2022Instruction.SetAuthority);
    });

    test('mint-lock and burn-lock produce different lockAccount addresses', async () => {
        const a = await createInitLockAccountTransaction(rpc, {
            lockType: 'mint-lock',
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            feePayer,
        });
        const b = await createInitLockAccountTransaction(rpc, {
            lockType: 'burn-lock',
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            feePayer,
        });
        expect(a.lockAccount).not.toEqual(b.lockAccount);
    });
});

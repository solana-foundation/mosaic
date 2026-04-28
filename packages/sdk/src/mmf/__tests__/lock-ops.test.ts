import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { address } from '@solana/kit';
import { createMockRpc, createMockSigner, seedMintDetails, seedTokenAccount } from '../../__tests__/test-utils';
import { Token2022Instruction, identifyToken2022Instruction } from '@solana-program/token-2022';
import {
    createBurnLockTransaction,
    createCancelBurnLockTransaction,
    createCancelMintLockTransaction,
    createMintLockTransaction,
    createSettleBurnLockTransaction,
    createSettleMintLockTransaction,
} from '../lock-ops';
import { deriveLockAccountAddress } from '../lock-address';

const MINT = address('HA3KcFsXNjRJsRZq1P1Y8qPAeSZnZsFyauCDEsSSGqTj');
const HOLDER = address('FA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');

const ixTypes = (instructions: readonly Instruction[]): Token2022Instruction[] =>
    instructions.map(i => identifyToken2022Instruction(i.data ?? new Uint8Array()));

const seedLockAccountBalance = async (
    rpc: Rpc<SolanaRpcApi>,
    lockType: 'mint-lock' | 'burn-lock',
    pdAddress: ReturnType<typeof address>,
    rawAmount: string,
) => {
    const { address: lockAddr } = await deriveLockAccountAddress({
        lockType,
        permanentDelegate: pdAddress,
        mint: MINT,
        holder: HOLDER,
    });
    seedTokenAccount(rpc, { address: lockAddr, mint: MINT, state: 'frozen', amount: rawAmount });
};

describe('mmf lock ops', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const feePayer = createMockSigner();
    const pd = createMockSigner('sAPDrViGV3C6PaT4xD7uRDDvB4xCURfZzDkGEd8Yv4v');
    const freezeAuth = createMockSigner('GA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');
    const mintAuthority = createMockSigner('JA4EafWTpd3WEpB5hzsMjPwWnFBzjN25nKHsStgxBpiT');

    beforeEach(() => {
        rpc = createMockRpc();
        seedMintDetails(rpc, { address: MINT, decimals: 6 });
        seedTokenAccount(rpc, { address: HOLDER, mint: MINT, state: 'frozen' });
    });

    test('createMintLockTransaction: thaw -> mintTo -> freeze', async () => {
        const tx = await createMintLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1.5,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            mintAuthority,
            feePayer,
        });
        expect(ixTypes(tx.instructions)).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.MintToChecked,
            Token2022Instruction.FreezeAccount,
        ]);
    });

    test('createBurnLockTransaction: thaw -> transferChecked -> freeze', async () => {
        const tx = await createBurnLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1.5,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        expect(ixTypes(tx.instructions)).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.TransferChecked,
            Token2022Instruction.FreezeAccount,
        ]);
    });

    test('createSettleMintLockTransaction: thaw -> transferChecked(full balance) -> close', async () => {
        await seedLockAccountBalance(rpc, 'mint-lock', pd.address, '1234567');
        const tx = await createSettleMintLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        expect(ixTypes(tx.instructions)).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.TransferChecked,
            Token2022Instruction.CloseAccount,
        ]);
    });

    test('createCancelMintLockTransaction: thaw -> burn(full balance) -> close', async () => {
        await seedLockAccountBalance(rpc, 'mint-lock', pd.address, '999');
        const tx = await createCancelMintLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        expect(ixTypes(tx.instructions)).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.BurnChecked,
            Token2022Instruction.CloseAccount,
        ]);
    });

    test('createSettleBurnLockTransaction: thaw -> burn(full balance) -> close', async () => {
        await seedLockAccountBalance(rpc, 'burn-lock', pd.address, '500');
        const tx = await createSettleBurnLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        expect(ixTypes(tx.instructions)).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.BurnChecked,
            Token2022Instruction.CloseAccount,
        ]);
    });

    test('createCancelBurnLockTransaction: thaw -> transferChecked(full balance) -> close', async () => {
        await seedLockAccountBalance(rpc, 'burn-lock', pd.address, '42');
        const tx = await createCancelBurnLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        expect(ixTypes(tx.instructions)).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.TransferChecked,
            Token2022Instruction.CloseAccount,
        ]);
    });

    test('settle/cancel use the live lock-account balance, not a caller-provided amount', async () => {
        // Seed a non-trivial balance and assert TransferChecked carries that exact raw amount.
        // This proves we drain the full balance via getAccountInfo, so close cannot fail with
        // a non-zero residual no matter what the caller passes (since they pass nothing).
        await seedLockAccountBalance(rpc, 'mint-lock', pd.address, '7654321');
        const tx = await createSettleMintLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        // TransferChecked layout: u8 discriminator (12) + u64 amount (LE) + u8 decimals.
        const transferIx = tx.instructions[1];
        const data = transferIx.data!;
        expect(data[0]).toBe(12);
        const amt = new DataView(data.buffer, data.byteOffset + 1, 8).getBigUint64(0, true);
        expect(amt).toBe(7654321n);
    });

    test('settle throws when lock account does not exist', async () => {
        // No seed; lock account is missing. Settle should refuse rather than emit a doomed tx.
        await expect(
            createSettleMintLockTransaction(rpc, {
                mint: MINT,
                holder: HOLDER,
                permanentDelegate: pd,
                freezeAuthority: freezeAuth,
                feePayer,
            }),
        ).rejects.toThrow(/does not exist/);
    });

    test('mint-lock and burn-lock target different lock accounts in tx sources', async () => {
        const mintTx = await createMintLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            mintAuthority,
            feePayer,
        });
        const burnTx = await createBurnLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        const mintLockAddr = (
            await deriveLockAccountAddress({
                lockType: 'mint-lock',
                permanentDelegate: pd.address,
                mint: MINT,
                holder: HOLDER,
            })
        ).address;
        const burnLockAddr = (
            await deriveLockAccountAddress({
                lockType: 'burn-lock',
                permanentDelegate: pd.address,
                mint: MINT,
                holder: HOLDER,
            })
        ).address;
        expect(mintLockAddr).not.toEqual(burnLockAddr);
        // mintTo target is index 1 in [thaw, mintTo, freeze]; account index 1 is the destination token.
        expect(mintTx.instructions[1].accounts?.[1].address).toEqual(mintLockAddr);
        // burn-lock thaw target is the lock account at index 0 in [thaw, transfer, freeze]; account index 0 is the account to thaw.
        expect(burnTx.instructions[0].accounts?.[0].address).toEqual(burnLockAddr);
    });
});

import type { Rpc, SolanaRpcApi, Instruction } from '@solana/kit';
import { address } from '@solana/kit';
import {
    createMockRpc,
    createMockSigner,
    seedMintDetails,
    seedTokenAccount,
} from '../../__tests__/test-utils';
import {
    Token2022Instruction,
    identifyToken2022Instruction,
} from '@solana-program/token-2022';
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

    test('createSettleMintLockTransaction: idempotentATA -> thaw -> transferChecked -> close', async () => {
        const tx = await createSettleMintLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        // First ix is ATA program (not Token-2022) — assert by skipping it.
        expect(ixTypes(tx.instructions.slice(1))).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.TransferChecked,
            Token2022Instruction.CloseAccount,
        ]);
    });

    test('createCancelMintLockTransaction: thaw -> burn -> close', async () => {
        const tx = await createCancelMintLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1,
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

    test('createSettleBurnLockTransaction: thaw -> burn -> close', async () => {
        const tx = await createSettleBurnLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1,
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

    test('createCancelBurnLockTransaction: idempotentATA -> thaw -> transferChecked -> close', async () => {
        const tx = await createCancelBurnLockTransaction(rpc, {
            mint: MINT,
            holder: HOLDER,
            decimalAmount: 1,
            permanentDelegate: pd,
            freezeAuthority: freezeAuth,
            feePayer,
        });
        expect(ixTypes(tx.instructions.slice(1))).toEqual([
            Token2022Instruction.ThawAccount,
            Token2022Instruction.TransferChecked,
            Token2022Instruction.CloseAccount,
        ]);
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
        const mintLockAddr = (await deriveLockAccountAddress({
            lockType: 'mint-lock',
            permanentDelegate: pd.address,
            mint: MINT,
            holder: HOLDER,
        })).address;
        const burnLockAddr = (await deriveLockAccountAddress({
            lockType: 'burn-lock',
            permanentDelegate: pd.address,
            mint: MINT,
            holder: HOLDER,
        })).address;
        expect(mintLockAddr).not.toEqual(burnLockAddr);
        // mintTo target is index 1 in [thaw, mintTo, freeze]; account index 1 is the destination token.
        expect(mintTx.instructions[1].accounts?.[1].address).toEqual(mintLockAddr);
        // burn-lock thaw target is the lock account at index 0 in [thaw, transfer, freeze]; account index 0 is the account to thaw.
        expect(burnTx.instructions[0].accounts?.[0].address).toEqual(burnLockAddr);
    });
});

import {
    type Address,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    appendTransactionMessageInstructions,
    createTransactionMessage,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    getBurnCheckedInstruction,
    getCloseAccountInstruction,
    getCreateAssociatedTokenIdempotentInstruction,
    getFreezeAccountInstruction,
    getMintToCheckedInstruction,
    getThawAccountInstruction,
    getTransferCheckedInstruction,
} from '@solana-program/token-2022';
import type { FullTransaction } from '../transaction-util';
import { decimalAmountToRaw, getMintDetails, resolveTokenAccount } from '../transaction-util';
import { deriveLockAccountAddress, type LockType } from './lock-address';

interface LockOpCommon {
    mint: Address;
    holder: Address;
    decimalAmount: number;
    permanentDelegate: TransactionSigner<string>;
    freezeAuthority: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
}

const buildTx = async (
    rpc: Rpc<SolanaRpcApi>,
    feePayer: TransactionSigner<string>,
    instructions: Instruction[],
): Promise<FullTransaction> => {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

const thawIx = (lockAccount: Address, mint: Address, freezeAuthority: TransactionSigner<string>) =>
    getThawAccountInstruction(
        { account: lockAccount, mint, owner: freezeAuthority },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    );

const freezeIx = (lockAccount: Address, mint: Address, freezeAuthority: TransactionSigner<string>) =>
    getFreezeAccountInstruction(
        { account: lockAccount, mint, owner: freezeAuthority },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    );

const closeIx = (lockAccount: Address, destination: Address, closeAuthority: TransactionSigner<string>) =>
    getCloseAccountInstruction(
        { account: lockAccount, destination, owner: closeAuthority },
        { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
    );

const resolveLockAccount = async (
    lockType: LockType,
    permanentDelegate: Address,
    mint: Address,
    holder: Address,
): Promise<Address> => {
    const { address } = await deriveLockAccountAddress({ lockType, permanentDelegate, mint, holder });
    return address;
};

/**
 * Mints into the holder's mint-lock account: thaw -> mintTo -> freeze.
 * Mint authority + freeze authority sign. Lock account must already exist.
 */
export const createMintLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockOpCommon & { mintAuthority: TransactionSigner<string> },
): Promise<FullTransaction> => {
    const { mint, holder, decimalAmount, permanentDelegate, freezeAuthority, mintAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('mint-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    const instructions: Instruction[] = [
        thawIx(lockAccount, mint, freezeAuthority),
        getMintToCheckedInstruction(
            { mint, mintAuthority, token: lockAccount, amount: rawAmount, decimals },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        freezeIx(lockAccount, mint, freezeAuthority),
    ];

    return buildTx(rpc, feePayer, instructions);
};

/**
 * Moves tokens from the holder's ATA into the burn-lock account: thaw -> transfer (PD authority) -> freeze.
 * Permanent delegate + freeze authority sign. Lock account must already exist.
 */
export const createBurnLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockOpCommon,
): Promise<FullTransaction> => {
    const { mint, holder, decimalAmount, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('burn-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const { tokenAccount: holderAta } = await resolveTokenAccount(rpc, holder, mint);
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    const instructions: Instruction[] = [
        thawIx(lockAccount, mint, freezeAuthority),
        getTransferCheckedInstruction(
            {
                source: holderAta,
                mint,
                destination: lockAccount,
                authority: permanentDelegate,
                amount: rawAmount,
                decimals,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        freezeIx(lockAccount, mint, freezeAuthority),
    ];

    return buildTx(rpc, feePayer, instructions);
};

/**
 * Settles a mint-lock by transferring it to the holder's ATA: thaw -> transfer (PD authority) -> close.
 * Permanent delegate + freeze authority sign. The lock account is closed; rent flows to feePayer.
 * Holder ATA is created idempotently if missing.
 */
export const createSettleMintLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockOpCommon,
): Promise<FullTransaction> => {
    const { mint, holder, decimalAmount, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('mint-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const { tokenAccount: holderAta } = await resolveTokenAccount(rpc, holder, mint);
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    const instructions: Instruction[] = [
        getCreateAssociatedTokenIdempotentInstruction({
            payer: feePayer,
            ata: holderAta,
            owner: holder,
            mint,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        thawIx(lockAccount, mint, freezeAuthority),
        getTransferCheckedInstruction(
            {
                source: lockAccount,
                mint,
                destination: holderAta,
                authority: permanentDelegate,
                amount: rawAmount,
                decimals,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        closeIx(lockAccount, feePayer.address, permanentDelegate),
    ];

    return buildTx(rpc, feePayer, instructions);
};

/**
 * Cancels a mint-lock by burning the locked tokens: thaw -> burn (PD authority) -> close.
 * Permanent delegate + freeze authority sign.
 */
export const createCancelMintLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockOpCommon,
): Promise<FullTransaction> => {
    const { mint, holder, decimalAmount, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('mint-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    const instructions: Instruction[] = [
        thawIx(lockAccount, mint, freezeAuthority),
        getBurnCheckedInstruction(
            { account: lockAccount, mint, authority: permanentDelegate, amount: rawAmount, decimals },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        closeIx(lockAccount, feePayer.address, permanentDelegate),
    ];

    return buildTx(rpc, feePayer, instructions);
};

/**
 * Settles a burn-lock by burning the locked tokens: thaw -> burn (PD authority) -> close.
 * Permanent delegate + freeze authority sign.
 */
export const createSettleBurnLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockOpCommon,
): Promise<FullTransaction> => {
    const { mint, holder, decimalAmount, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('burn-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    const instructions: Instruction[] = [
        thawIx(lockAccount, mint, freezeAuthority),
        getBurnCheckedInstruction(
            { account: lockAccount, mint, authority: permanentDelegate, amount: rawAmount, decimals },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        closeIx(lockAccount, feePayer.address, permanentDelegate),
    ];

    return buildTx(rpc, feePayer, instructions);
};

/**
 * Cancels a burn-lock by returning tokens to the holder's ATA: thaw -> transfer (PD authority) -> close.
 * Permanent delegate + freeze authority sign. Holder ATA is created idempotently if missing.
 */
export const createCancelBurnLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockOpCommon,
): Promise<FullTransaction> => {
    const { mint, holder, decimalAmount, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('burn-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const { tokenAccount: holderAta } = await resolveTokenAccount(rpc, holder, mint);
    const rawAmount = decimalAmountToRaw(decimalAmount, decimals);

    const instructions: Instruction[] = [
        getCreateAssociatedTokenIdempotentInstruction({
            payer: feePayer,
            ata: holderAta,
            owner: holder,
            mint,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        thawIx(lockAccount, mint, freezeAuthority),
        getTransferCheckedInstruction(
            {
                source: lockAccount,
                mint,
                destination: holderAta,
                authority: permanentDelegate,
                amount: rawAmount,
                decimals,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        closeIx(lockAccount, feePayer.address, permanentDelegate),
    ];

    return buildTx(rpc, feePayer, instructions);
};

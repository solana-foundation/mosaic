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

/**
 * Inputs for settle/cancel operations. These drain the entire lock account balance
 * and close the account, so they don't take an explicit amount: any partial-amount
 * call would leave a non-zero balance and CloseAccount would fail.
 */
interface LockSettleCancelInput {
    mint: Address;
    holder: Address;
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
 * Fetches the lock account's raw balance via getAccountInfo(jsonParsed). Throws if the
 * account does not exist or is not a parsable Token-2022 account, since settle/cancel
 * cannot run against a non-existent lock.
 */
const getLockAccountRawBalance = async (rpc: Rpc<SolanaRpcApi>, lockAccount: Address): Promise<bigint> => {
    const info = await rpc.getAccountInfo(lockAccount, { encoding: 'jsonParsed' }).send();
    if (!info.value) {
        throw new Error(`Lock account ${lockAccount} does not exist`);
    }
    const data = info.value.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } };
    const amount = data?.parsed?.info?.tokenAmount?.amount;
    if (amount == null) {
        throw new Error(`Lock account ${lockAccount} is not a parsable token account`);
    }
    return BigInt(amount);
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
 * Moves tokens from the holder's ATA into the burn-lock account:
 * thaw(lock) -> transfer (PD authority) -> freeze(lock). Permanent delegate + freeze authority sign.
 *
 * Preconditions (caller-enforced; not validated here):
 *   - The lock account exists.
 *   - The holder's ATA exists AND is thawed (i.e. the holder is allowlisted via SRFC-37
 *     or out-of-band whitelist). Token-2022's TransferChecked rejects a frozen *source*
 *     even when the PermanentDelegate is the authority. A frozen holder ATA correctly
 *     blocks this op — that's the allowlist enforcing itself, not a bug to work around.
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
 * Settles a mint-lock by transferring the full lock balance to the holder's ATA:
 * thaw -> transfer (PD authority) -> close. Permanent delegate + freeze authority sign.
 * Rent flows to feePayer.
 *
 * Preconditions (caller-enforced; not validated here):
 *   - The lock account exists (created via createInitLockAccountTransaction).
 *   - The holder's ATA exists AND is thawed. With DefaultAccountState=Frozen, a fresh
 *     ATA is frozen and Token-2022 TransferChecked rejects transfers to a frozen account
 *     even when the PermanentDelegate is the authority. Issuers typically thaw via
 *     SRFC-37 allowlist or an out-of-band whitelist step.
 */
export const createSettleMintLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockSettleCancelInput,
): Promise<FullTransaction> => {
    const { mint, holder, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('mint-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const { tokenAccount: holderAta } = await resolveTokenAccount(rpc, holder, mint);
    const rawAmount = await getLockAccountRawBalance(rpc, lockAccount);

    const instructions: Instruction[] = [
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
 * Cancels a mint-lock by burning the full lock balance: thaw -> burn (PD authority) -> close.
 * Permanent delegate + freeze authority sign. Rent flows to feePayer.
 */
export const createCancelMintLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockSettleCancelInput,
): Promise<FullTransaction> => {
    const { mint, holder, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('mint-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const rawAmount = await getLockAccountRawBalance(rpc, lockAccount);

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
 * Settles a burn-lock by burning the full lock balance: thaw -> burn (PD authority) -> close.
 * Permanent delegate + freeze authority sign. Rent flows to feePayer.
 */
export const createSettleBurnLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockSettleCancelInput,
): Promise<FullTransaction> => {
    const { mint, holder, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('burn-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const rawAmount = await getLockAccountRawBalance(rpc, lockAccount);

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
 * Cancels a burn-lock by returning the full lock balance to the holder's ATA:
 * thaw -> transfer (PD authority) -> close. Permanent delegate + freeze authority sign.
 * Rent flows to feePayer.
 *
 * Preconditions (caller-enforced; not validated here):
 *   - The lock account exists.
 *   - The holder's ATA exists AND is thawed (see createSettleMintLockTransaction notes).
 */
export const createCancelBurnLockTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: LockSettleCancelInput,
): Promise<FullTransaction> => {
    const { mint, holder, permanentDelegate, freezeAuthority, feePayer } = input;
    const lockAccount = await resolveLockAccount('burn-lock', permanentDelegate.address, mint, holder);
    const { decimals } = await getMintDetails(rpc, mint);
    const { tokenAccount: holderAta } = await resolveTokenAccount(rpc, holder, mint);
    const rawAmount = await getLockAccountRawBalance(rpc, lockAccount);

    const instructions: Instruction[] = [
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

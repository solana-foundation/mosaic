import type { Client } from './setup.js';
import {
    AccountRole,
    address,
    appendTransactionMessageInstructions,
    createTransactionMessage,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    type AccountSignerMeta,
    type Address,
    type Instruction,
    type TransactionSigner,
} from '@solana/kit';
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
    encodeExtraAccountMetas,
    findExtraAccountMetaListPda,
    type ExtraAccountMeta,
} from '../../transfer/transfer-hook.js';
import type { FullTransaction } from '../../transaction-util.js';

/**
 * Address the SPL example transfer hook (`spl-transfer-hook-example`) is loaded at. The program
 * binary is `fixtures/spl_transfer_hook_example_no_default_features.so` (provenance in
 * `src/scripts/test-with-validator.js`), which that script loads with `--bpf-program` at this
 * address. The example hook's `Execute` re-derives every extra account declared in the mint's
 * validation account and fails unless the transfer passed exactly those accounts, with the
 * declared signer/writable flags.
 */
export const TRANSFER_HOOK_EXAMPLE_PROGRAM_ID = address('FpkgZNfydbXDX7mXAjZCHwKngPnkSJkJAkkSd7Ffmw3t');

/** `spl-transfer-hook-interface:initialize-extra-account-metas` discriminator. */
const INITIALIZE_EXTRA_ACCOUNT_META_LIST_DISCRIMINATOR = [43, 34, 13, 49, 167, 88, 235, 235];

/** Literal account that the hook declares; also the program of an `AccountPda` extra below. */
export const FIXED_EXTRA = address('SysvarRent111111111111111111111111111111111');

/**
 * One extra account of every resolution kind the interface supports. Indices count from the
 * `Execute` accounts: 0 source, 1 mint, 2 destination, 3 authority, 4 validation account, then
 * the extras in order (5 = FIXED_EXTRA).
 */
export const EXTRA_METAS: ExtraAccountMeta[] = [
    // 5: fixed address
    { config: { __kind: 'Literal', address: FIXED_EXTRA }, isSigner: false, isWritable: false },
    // 6: hook-program PDA from a literal seed and the mint and authority keys
    {
        config: {
            __kind: 'ProgramPda',
            seeds: [
                { __kind: 'Literal', bytes: new TextEncoder().encode('mosaic') },
                { __kind: 'AccountKey', index: 1 },
                { __kind: 'AccountKey', index: 3 },
            ],
        },
        isSigner: false,
        isWritable: true,
    },
    // 7: hook-program PDA from the transfer amount in the Execute instruction data
    {
        config: { __kind: 'ProgramPda', seeds: [{ __kind: 'InstructionData', index: 8, length: 8 }] },
        isSigner: false,
        isWritable: false,
    },
    // 8: hook-program PDA from the source token account's owner (account data bytes 32..64)
    {
        config: {
            __kind: 'ProgramPda',
            seeds: [{ __kind: 'AccountData', accountIndex: 0, dataIndex: 32, length: 32 }],
        },
        isSigner: false,
        isWritable: false,
    },
    // 9: the source token account's owner, read as pubkey data
    {
        config: { __kind: 'PubkeyData', pubkeyData: { __kind: 'AccountData', accountIndex: 0, dataIndex: 32 } },
        isSigner: false,
        isWritable: false,
    },
    // 10: PDA of another extra account's program (FIXED_EXTRA, index 5) seeded by extra 6's key
    {
        config: { __kind: 'AccountPda', accountIndex: 5, seeds: [{ __kind: 'AccountKey', index: 6 }] },
        isSigner: false,
        isWritable: false,
    },
];

/**
 * Builds the example hook's `InitializeExtraAccountMetaList`. The example program only allocates
 * and assigns the validation account, so it is funded for rent first in the same transaction.
 */
export async function initializeExtraAccountMetasTransaction(
    client: Client,
    mint: Address,
    mintAuthority: TransactionSigner<string>,
    payer: TransactionSigner<string>,
    metas: ExtraAccountMeta[],
): Promise<FullTransaction> {
    const [validationAccount] = await findExtraAccountMetaListPda(
        { mint },
        { programAddress: TRANSFER_HOOK_EXAMPLE_PROGRAM_ID },
    );
    const encodedMetas = encodeExtraAccountMetas(metas);
    // TLV header (8-byte type + 4-byte length) around the u32 count + packed metas.
    const space = 8 + 4 + encodedMetas.length;
    const rent = await client.rpc.getMinimumBalanceForRentExemption(BigInt(space)).send();

    const authorityMeta: AccountSignerMeta = {
        address: mintAuthority.address,
        role: AccountRole.READONLY_SIGNER,
        signer: mintAuthority,
    };
    const initialize: Instruction = {
        programAddress: TRANSFER_HOOK_EXAMPLE_PROGRAM_ID,
        accounts: [
            { address: validationAccount, role: AccountRole.WRITABLE },
            { address: mint, role: AccountRole.READONLY },
            authorityMeta,
            { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        ],
        data: new Uint8Array([...INITIALIZE_EXTRA_ACCOUNT_META_LIST_DISCRIMINATOR, ...encodedMetas]),
    };
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m =>
            appendTransactionMessageInstructions(
                [
                    getTransferSolInstruction({ source: payer, destination: validationAccount, amount: rent }),
                    initialize,
                ],
                m,
            ),
    ) as FullTransaction;
}

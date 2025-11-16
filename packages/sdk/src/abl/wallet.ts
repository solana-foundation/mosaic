import {
    createTransaction,
    type Address,
    type FullTransaction,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionMessageWithFeePayer,
    type TransactionSigner,
    type TransactionVersion,
    type TransactionWithBlockhashLifetime,
} from 'gill';
import { ABL_PROGRAM_ID } from './utils';
import { findWalletEntryPda, getAddWalletInstruction, getRemoveWalletInstruction } from '@token-acl/abl-sdk';

/**
 * Generates instructions for adding a wallet to an allowlist or blocklist.
 *
 * This function creates instructions to add a specific wallet address to an existing
 * allowlist or blocklist configuration. The wallet will be associated with the list
 * and can be used for gating token operations based on the list's mode.
 *
 * @param input - Configuration parameters for adding a wallet to the list
 * @param input.authority - The authority signer who controls the list configuration
 * @param input.list - The list configuration address to add the wallet to
 * @param input.wallet - The wallet address to add to the list
 * @returns Promise containing the instructions for adding the wallet to the list
 */
export const getAddWalletInstructions = async (input: {
    authority: TransactionSigner<string>;
    list: Address;
    wallet: Address;
}): Promise<Instruction<string>[]> => {
    const abWallet = await findWalletEntryPda(
        { walletAddress: input.wallet, listConfig: input.list },
        { programAddress: ABL_PROGRAM_ID },
    );

    const addWalletToListInstruction = getAddWalletInstruction(
        {
            authority: input.authority,
            listConfig: input.list,
            wallet: input.wallet,
            walletEntry: abWallet[0],
        },
        { programAddress: ABL_PROGRAM_ID },
    );

    return [addWalletToListInstruction];
};

/**
 * Creates a complete transaction for adding a wallet to an allowlist or blocklist.
 *
 * This function builds a full transaction that can be signed and sent to add
 * a wallet address to an existing list configuration. The transaction includes
 * the necessary instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who controls the list configuration
 * @param input.wallet - The wallet address to add to the list
 * @param input.list - The list configuration address to add the wallet to
 * @returns Promise containing the full transaction for adding the wallet to the list
 */
export const getAddWalletTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    wallet: Address;
    list: Address;
}): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const instructions = await getAddWalletInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return transaction;
};

/**
 * Generates instructions for removing a wallet from an allowlist or blocklist.
 *
 * This function creates instructions to remove a specific wallet address from an existing
 * allowlist or blocklist configuration. The wallet will no longer be associated with
 * the list and will not be subject to the list's gating rules.
 *
 * @param input - Configuration parameters for removing a wallet from the list
 * @param input.authority - The authority signer who controls the list configuration
 * @param input.list - The list configuration address to remove the wallet from
 * @param input.wallet - The wallet address to remove from the list
 * @returns Promise containing the instructions for removing the wallet from the list
 */
export const getRemoveWalletInstructions = async (input: {
    authority: TransactionSigner<string>;
    list: Address;
    wallet: Address;
}): Promise<Instruction<string>[]> => {
    const abWallet = await findWalletEntryPda(
        { walletAddress: input.wallet, listConfig: input.list },
        { programAddress: ABL_PROGRAM_ID },
    );

    const removeWalletFromListInstruction = getRemoveWalletInstruction(
        {
            authority: input.authority,
            listConfig: input.list,
            walletEntry: abWallet[0],
        },
        { programAddress: ABL_PROGRAM_ID },
    );

    return [removeWalletFromListInstruction];
};

/**
 * Creates a complete transaction for removing a wallet from an allowlist or blocklist.
 *
 * This function builds a full transaction that can be signed and sent to remove
 * a wallet address from an existing list configuration. The transaction includes
 * the necessary instructions and uses the latest blockhash for proper construction.
 *
 * @param input - Configuration parameters for the transaction
 * @param input.rpc - The Solana RPC client instance
 * @param input.payer - The transaction fee payer signer
 * @param input.authority - The authority signer who controls the list configuration
 * @param input.wallet - The wallet address to remove from the list
 * @param input.list - The list configuration address to remove the wallet from
 * @returns Promise containing the full transaction for removing the wallet from the list
 */
export const getRemoveWalletTransaction = async (input: {
    rpc: Rpc<SolanaRpcApi>;
    payer: TransactionSigner<string>;
    authority: TransactionSigner<string>;
    wallet: Address;
    list: Address;
}): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const instructions = await getRemoveWalletInstructions(input);
    const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
    const transaction = createTransaction({
        feePayer: input.payer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
    return transaction;
};

import {
    type Address,
    createNoopSigner,
    createTransaction,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from 'gill';
import { getFreezeAccountInstruction, getThawAccountInstruction, TOKEN_2022_PROGRAM_ADDRESS } from 'gill/programs';
import { findListConfigPda, Mode } from '@token-acl/abl-sdk';
import { getMintDetails, isDefaultAccountStateSetFrozen, resolveTokenAccount } from '../transactionUtil';
import { ABL_PROGRAM_ID, getAddWalletInstructions, getList, getRemoveWalletInstructions } from '../abl';
import { getFreezeInstructions } from '../token-acl/freeze';
import { getThawPermissionlessInstructions } from '../token-acl/thawPermissionless';

export const isAblBlocklist = async (rpc: Rpc<SolanaRpcApi>, listConfig: Address) => {
    const list = await getList({ rpc, listConfig });
    return list.mode === Mode.Block;
};

/**
 * Gets the instructions to add an account to a blocklist
 * If the mint has SRFC37 enabled, the account will be added to the blocklist and frozen
 * If the mint does not have SRFC37 enabled, the account will only be frozen
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param account - The account address to add to the blocklist
 * @param authority - The authority signer
 */
export const getAddToBlocklistInstructions = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
): Promise<Instruction[]> => {
    const { tokenAccount, isInitialized, isFrozen } = await resolveTokenAccount(rpc, account, mint);
    const accountSigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;

    const { extensions, usesTokenAcl } = await getMintDetails(rpc, mint);
    const enableSrfc37 = usesTokenAcl && isDefaultAccountStateSetFrozen(extensions);

    if (!enableSrfc37) {
        return [
            getFreezeAccountInstruction(
                {
                    account: tokenAccount,
                    mint,
                    owner: accountSigner,
                },
                {
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                },
            ),
        ];
    }

    const listConfigPda = await findListConfigPda(
        {
            authority: accountSigner.address,
            seed: mint,
        },
        { programAddress: ABL_PROGRAM_ID },
    );
    if (!(await isAblBlocklist(rpc, listConfigPda[0]))) {
        throw new Error('This is not an ABL blocklist');
    }
    const addToBlocklistInstructions = await getAddWalletInstructions({
        authority: accountSigner,
        wallet: account,
        list: listConfigPda[0],
    });
    const freezeInstructions =
        isInitialized && !isFrozen
            ? await getFreezeInstructions({
                  rpc,
                  authority: accountSigner,
                  tokenAccount,
              })
            : [];
    return [...addToBlocklistInstructions, ...freezeInstructions];
};

export const createAddToBlocklistTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
) => {
    const instructions = await getAddToBlocklistInstructions(rpc, mint, account, authority);
    const authoritySigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return createTransaction({
        feePayer: authoritySigner,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
};

export const getRemoveFromBlocklistInstructions = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
): Promise<Instruction[]> => {
    const { tokenAccount: destinationAta, isInitialized, isFrozen } = await resolveTokenAccount(rpc, account, mint);
    const accountSigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;

    const { extensions, usesTokenAcl } = await getMintDetails(rpc, mint);
    const enableSrfc37 = usesTokenAcl && isDefaultAccountStateSetFrozen(extensions);

    if (!enableSrfc37) {
        return [
            getThawAccountInstruction(
                {
                    account: destinationAta,
                    mint,
                    owner: accountSigner,
                },
                {
                    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                },
            ),
        ];
    }

    const listConfigPda = await findListConfigPda(
        {
            authority: accountSigner.address,
            seed: mint,
        },
        { programAddress: ABL_PROGRAM_ID },
    );
    if (!(await isAblBlocklist(rpc, listConfigPda[0]))) {
        throw new Error('This is not an ABL blocklist');
    }
    const instructions = [];
    const removeFromBlocklistInstructions = await getRemoveWalletInstructions({
        authority: accountSigner,
        wallet: account,
        list: listConfigPda[0],
    });
    instructions.push(...removeFromBlocklistInstructions);

    const useSrfc37 = enableSrfc37 ?? false;
    if (isInitialized && isFrozen && useSrfc37) {
        // TODO: this should unfreeze all accounts owned by the wallet
        const thawInstructions = await getThawPermissionlessInstructions({
            authority: accountSigner,
            mint,
            tokenAccount: destinationAta,
            tokenAccountOwner: account,
            rpc,
        });
        instructions.push(...thawInstructions);
    }
    return instructions;
};

export const createRemoveFromBlocklistTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
) => {
    const instructions = await getRemoveFromBlocklistInstructions(rpc, mint, account, authority);
    const authoritySigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return createTransaction({
        feePayer: authoritySigner,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
};

import {
    type Address,
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    getFreezeAccountInstruction,
    getThawAccountInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { Mode } from '@solana/token-acl-gate-sdk';
import { getMintDetails, resolveTokenAccount } from '../transaction-util';
import { getAddWalletInstructions, getList, getListConfigPda, getRemoveWalletInstructions } from '../abl';
import { getFreezeInstructions } from '../token-acl/freeze';
import { getThawPermissionlessInstructions } from '../token-acl/thaw-permissionless';

export const isAblBlocklist = async (rpc: Rpc<SolanaRpcApi>, listConfig: Address) => {
    const list = await getList({ rpc, listConfig });
    return list.mode === Mode.Block;
};

/**
 * Gets the instructions to add an account to a blocklist
 * If the mint uses Token ACL, the account will be added to the ABL blocklist and frozen
 * through the Token ACL program
 * If the mint does not use Token ACL, there is no ABL list to mutate and the account is
 * only frozen, directly through Token-2022
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

    const { usesTokenAcl } = await getMintDetails(rpc, mint);

    // Token ACL reassigns freeze authority to its mintConfig PDA, so freeze/thaw must go
    // through the ACL program whenever it is configured — regardless of the mint's default
    // account state. Blocklist mints are deliberately created with
    // DefaultAccountState=Initialized (only blocked wallets get frozen), so additionally
    // requiring `frozen` here emitted a plain Token-2022 freeze signed by the wallet, which
    // can never land once the wallet is no longer the freeze authority.
    if (!usesTokenAcl) {
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

    const listConfigPda = await getListConfigPda({ authority: accountSigner.address, mint });
    if (!(await isAblBlocklist(rpc, listConfigPda))) {
        throw new Error('This is not an ABL blocklist');
    }
    const addToBlocklistInstructions = await getAddWalletInstructions({
        authority: accountSigner,
        wallet: account,
        list: listConfigPda,
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
): Promise<FullTransaction> => {
    const instructions = await getAddToBlocklistInstructions(rpc, mint, account, authority);
    const authoritySigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(authoritySigner.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

export const getRemoveFromBlocklistInstructions = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
): Promise<Instruction[]> => {
    const { tokenAccount: destinationAta, isInitialized, isFrozen } = await resolveTokenAccount(rpc, account, mint);
    const accountSigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;

    const { usesTokenAcl } = await getMintDetails(rpc, mint);

    // See getAddToBlocklistInstructions: the ACL path is keyed off Token ACL ownership of the
    // freeze authority alone, not off the mint's default account state.
    if (!usesTokenAcl) {
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

    const listConfigPda = await getListConfigPda({ authority: accountSigner.address, mint });
    if (!(await isAblBlocklist(rpc, listConfigPda))) {
        throw new Error('This is not an ABL blocklist');
    }
    const instructions = [];
    const removeFromBlocklistInstructions = await getRemoveWalletInstructions({
        authority: accountSigner,
        wallet: account,
        list: listConfigPda,
    });
    instructions.push(...removeFromBlocklistInstructions);

    if (isInitialized && isFrozen) {
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
): Promise<FullTransaction> => {
    const instructions = await getRemoveFromBlocklistInstructions(rpc, mint, account, authority);
    const authoritySigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(authoritySigner.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

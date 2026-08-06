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
import { getMintDetails, resolveTokenAccount } from '../transaction-util';
import { getAddWalletInstructions, getList, getListConfigPda, getRemoveWalletInstructions } from '../abl';
import { Mode } from '@solana/token-acl-gate-sdk';
import { getFreezeInstructions } from '../token-acl/freeze';
import { getThawPermissionlessInstructions } from '../token-acl/thaw-permissionless';
import {
    getFreezeAccountInstruction,
    getThawAccountInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';

export const isAblAllowlist = async (rpc: Rpc<SolanaRpcApi>, listConfig: Address) => {
    const list = await getList({ rpc, listConfig });
    return list.mode === Mode.Allow;
};

/**
 * Gets the instructions to add an account to an allowlist
 * If the mint uses Token ACL, the account will be added to the ABL allowlist and thawed
 * through the Token ACL program
 * If the mint does not use Token ACL, there is no ABL list to mutate and the account is
 * only thawed, directly through Token-2022
 *
 * @param rpc - The Solana RPC client instance
 * @param mint - The mint address
 * @param account - The account address to add to the allowlist
 * @param authority - The authority signer
 */
export const getAddToAllowlistInstructions = async (
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
    // account state. Gating on `frozen` as well emitted a plain Token-2022 thaw signed by the
    // wallet, which can never land once the wallet is no longer the freeze authority.
    if (!usesTokenAcl) {
        return [
            getThawAccountInstruction(
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

    const listConfigPda = await getListConfigPda({
        authority: accountSigner.address,
        mint,
    });
    if (!(await isAblAllowlist(rpc, listConfigPda))) {
        throw new Error('This is not an ABL allowlist');
    }
    const addToAllowlistInstructions = await getAddWalletInstructions({
        authority: accountSigner,
        wallet: account,
        list: listConfigPda,
    });
    const thawInstructions =
        isFrozen && isInitialized
            ? await getThawPermissionlessInstructions({
                  authority: accountSigner,
                  mint,
                  tokenAccount,
                  tokenAccountOwner: account,
                  rpc,
              })
            : [];
    return [...addToAllowlistInstructions, ...thawInstructions];
};

export const createAddToAllowlistTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
): Promise<FullTransaction> => {
    const instructions = await getAddToAllowlistInstructions(rpc, mint, account, authority);
    const authoritySigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(authoritySigner.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

export const getRemoveFromAllowlistInstructions = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
): Promise<Instruction[]> => {
    const { tokenAccount: destinationAta, isInitialized, isFrozen } = await resolveTokenAccount(rpc, account, mint);
    const accountSigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;

    const { usesTokenAcl } = await getMintDetails(rpc, mint);

    // See getAddToAllowlistInstructions: the ACL path is keyed off Token ACL ownership of the
    // freeze authority alone, not off the mint's default account state.
    if (!usesTokenAcl) {
        return [
            getFreezeAccountInstruction(
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
    if (!(await isAblAllowlist(rpc, listConfigPda))) {
        throw new Error('This is not an ABL allowlist');
    }
    const instructions = [];
    const removeFromAllowlistInstructions = await getRemoveWalletInstructions({
        authority: accountSigner,
        wallet: account,
        list: listConfigPda,
    });
    instructions.push(...removeFromAllowlistInstructions);

    // Losing allowlist membership must freeze an account that is still usable. This previously
    // read `isFrozen`, so it only ever "froze" accounts that were already frozen — a no-op that
    // left removed wallets fully able to transact.
    if (isInitialized && !isFrozen) {
        // TODO: this should freeze all accounts owned by the wallet
        const freezeInstructions = await getFreezeInstructions({
            rpc,
            authority: accountSigner,
            tokenAccount: destinationAta,
        });
        instructions.push(...freezeInstructions);
    }
    return instructions;
};

export const createRemoveFromAllowlistTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    mint: Address,
    account: Address,
    authority: Address | TransactionSigner<string>,
): Promise<FullTransaction> => {
    const instructions = await getRemoveFromAllowlistInstructions(rpc, mint, account, authority);
    const authoritySigner = typeof authority === 'string' ? createNoopSigner(authority) : authority;
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(authoritySigner.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

import { Token } from '../issuance';
import type { Rpc, Address, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
} from '@solana/kit';
import { Mode } from '@token-acl/abl-sdk';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { getCreateConfigInstructions } from '../token-acl/create-config';
import { getSetGatingProgramInstructions } from '../token-acl/set-gating-program';
import { getEnablePermissionlessThawInstructions } from '../token-acl/enable-permissionless-thaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/set-extra-metas';

/**
 * Creates a transaction to initialize a new stablecoin mint on Solana with common stablecoin features.
 *
 * This function configures the mint with metadata, pausable functionality, default account state,
 * confidential balances, and a permanent delegate. It returns a transaction ready to be signed and sent to the network.
 *
 * @param rpc - The Solana RPC client instance.
 * @param name - The name of the stablecoin.
 * @param symbol - The symbol of the stablecoin.
 * @param decimals - The number of decimals for the stablecoin.
 * @param uri - The URI pointing to the stablecoin's metadata.
 * @param mintAuthority - The address with authority over the mint.
 * @param mint - The address of the mint account to initialize.
 * @param feePayer - The address that will pay the transaction fees.
 * @param metadataAuthority - The address with authority over the metadata.
 * @param pausableAuthority - The address with authority over the pausable functionality.
 * @param confidentialBalancesAuthority - The address with authority over the confidential balances extension.
 * @param permanentDelegateAuthority - The address with authority over the permanent delegate.
 * @returns A promise that resolves to a FullTransaction object for initializing the stablecoin mint.
 */
export const createStablecoinInitTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    name: string,
    symbol: string,
    decimals: number,
    uri: string,
    mintAuthority: Address | TransactionSigner<string>,
    mint: Address | TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
    aclMode?: 'allowlist' | 'blocklist',
    metadataAuthority?: Address,
    pausableAuthority?: Address,
    confidentialBalancesAuthority?: Address,
    permanentDelegateAuthority?: Address,
    enableSrfc37?: boolean,
    freezeAuthority?: Address,
): Promise<FullTransaction> => {
    const mintSigner = typeof mint === 'string' ? createNoopSigner(mint) : mint;
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;

    aclMode = aclMode || 'blocklist';
    const useSrfc37 = enableSrfc37 ?? false;

    // 1. create token
    const mintAuthorityAddress = typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address;
    const instructions = await new Token()
        .withMetadata({
            mintAddress: mintSigner.address,
            authority: metadataAuthority || mintAuthorityAddress,
            metadata: {
                name,
                symbol,
                uri,
            },
            // TODO: add additional metadata
            additionalMetadata: new Map(),
        })
        .withPausable(pausableAuthority || mintAuthorityAddress)
        .withDefaultAccountState(!useSrfc37)
        .withConfidentialBalances(confidentialBalancesAuthority || mintAuthorityAddress)
        .withPermanentDelegate(permanentDelegateAuthority || mintAuthorityAddress)
        .buildInstructions({
            rpc,
            decimals,
            mintAuthority,
            freezeAuthority,
            mint: mintSigner,
            feePayer: feePayerSigner,
        });

    // 2. create mintConfig (Token ACL) - only if SRFC-37 is enabled
    if (mintAuthorityAddress !== feePayerSigner.address || !useSrfc37) {
        // Get latest blockhash for transaction
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        return pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(typeof feePayer === 'string' ? feePayer : feePayer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions(instructions, m),
        ) as FullTransaction;
    }

    const { instructions: createConfigInstructions } = await getCreateConfigInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    const setGatingProgramInstructions = await getSetGatingProgramInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    // 3. enable permissionless thaw (Token ACL)
    const enablePermissionlessThawInstructions = await getEnablePermissionlessThawInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
    });

    // 4. create list (abl)
    const { instructions: createListInstructions, listConfig } = await getCreateListInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        mode: aclMode === 'allowlist' ? Mode.Allow : Mode.Block,
    });

    // 5. set extra metas (abl): this is how we can change the list associated with a given mint
    const setExtraMetasInstructions = await getSetExtraMetasInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        lists: [listConfig],
    });

    instructions.push(...createConfigInstructions);
    instructions.push(...setGatingProgramInstructions);
    instructions.push(...enablePermissionlessThawInstructions);
    instructions.push(...createListInstructions);
    instructions.push(...setExtraMetasInstructions);

    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(typeof feePayer === 'string' ? feePayer : feePayer.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

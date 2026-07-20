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
import { getCreateConfigInstructions } from '../token-acl/create-config';
import { getSetGatingProgramInstructions } from '../token-acl/set-gating-program';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { getEnablePermissionlessThawInstructions } from '../token-acl/enable-permissionless-thaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/set-extra-metas';
import { Mode } from '@solana/token-acl-gate-sdk';

/**
 * Creates a transaction to initialize a new arcade token mint on Solana with common arcade token features.
 *
 * This function configures the mint with metadata, pausable functionality, default account state,
 * confidential balances, and a permanent delegate. It returns a transaction ready to be signed and sent to the network.
 * Arcade tokens are close loop tokens that have an explicit allowlist.
 *
 * @param rpc - The Solana RPC client instance.
 * @param name - The name of the arcade token.
 * @param symbol - The symbol of the arcade token.
 * @param decimals - The number of decimals for the arcade token.
 * @param uri - The URI pointing to the arcade token's metadata.
 * @param mintAuthority - The address with authority over the mint.
 * @param mint - The address of the mint account to initialize.
 * @param feePayer - The address that will pay the transaction fees.
 * @param metadataAuthority - The address with authority over the metadata.
 * @param pausableAuthority - The address with authority over the pausable functionality.
 * @param permanentDelegateAuthority - The address with authority over the permanent delegate.
 * @param enableSrfc37 - Whether to enable SRFC-37.
 * @returns A promise that resolves to a FullTransaction object for initializing the arcade token mint.
 */
export const createArcadeTokenInitTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    name: string,
    symbol: string,
    decimals: number,
    uri: string,
    mintAuthority: Address | TransactionSigner<string>,
    mint: Address | TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
    metadataAuthority?: Address,
    pausableAuthority?: Address,
    permanentDelegateAuthority?: Address,
    enableSrfc37?: boolean,
    freezeAuthority?: Address,
): Promise<FullTransaction> => {
    const mintSigner = typeof mint === 'string' ? createNoopSigner(mint) : mint;
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const mintAuthoritySigner = typeof mintAuthority === 'string' ? createNoopSigner(mintAuthority) : mintAuthority;
    const useSrfc37 = enableSrfc37 ?? false;
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
        .withPermanentDelegate(permanentDelegateAuthority || mintAuthorityAddress)
        .buildInstructions({
            rpc,
            decimals,
            mintAuthority,
            // On the sRFC-37 path the freeze authority MUST be the mint authority: the
            // Token-ACL `create_config` instruction requires the mint's current freeze
            // authority to equal its signer (the mint authority) and then reassigns it to
            // the config PDA itself. Pre-setting it to anything else (e.g. the program id)
            // fails create_config with InvalidAuthority.
            freezeAuthority: useSrfc37 ? mintAuthorityAddress : freezeAuthority,
            mint: mintSigner,
            feePayer: feePayerSigner,
        });

    // 2. create mintConfig (Token ACL) - only if SRFC-37 is enabled
    if (!useSrfc37) {
        // Get latest blockhash for transaction
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        return pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(typeof feePayer === 'string' ? feePayer : feePayer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions(instructions, m),
        ) as FullTransaction;
    }

    // The on-chain authority for Token-ACL/ABL setup stays the mint authority so the
    // derived config/list PDAs are keyed off custody and later custody-signed
    // mutations (addToList, thaw) succeed. Account creation is funded by the fee
    // payer via `payer`, allowing a sponsored (e.g. Kora) deploy where feePayer !== mintAuthority.
    const { instructions: createConfigInstructions } = await getCreateConfigInstructions({
        authority: mintAuthoritySigner,
        payer: feePayerSigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    const setGatingProgramInstructions = await getSetGatingProgramInstructions({
        authority: mintAuthoritySigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    // 3. enable permissionless thaw (Token ACL))
    const enablePermissionlessThawInstructions = await getEnablePermissionlessThawInstructions({
        authority: mintAuthoritySigner,
        mint: mintSigner.address,
    });

    // 4. create list (abl)
    const { instructions: createListInstructions, listConfig } = await getCreateListInstructions({
        authority: mintAuthoritySigner,
        payer: feePayerSigner,
        mint: mintSigner.address,
        mode: Mode.Allow,
    });

    // 5. set extra metas (abl): this is how we can change the list associated with a given mint
    const setExtraMetasInstructions = await getSetExtraMetasInstructions({
        authority: mintAuthoritySigner,
        payer: feePayerSigner,
        mint: mintSigner.address,
        addresses: [listConfig],
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

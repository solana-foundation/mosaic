import { Token } from '../issuance';
import type {
    Rpc,
    Address,
    SolanaRpcApi,
    FullTransaction,
    TransactionMessageWithFeePayer,
    TransactionVersion,
    TransactionSigner,
    TransactionWithBlockhashLifetime,
} from 'gill';
import { createNoopSigner, createTransaction } from 'gill';
import { Mode } from '@token-acl/abl-sdk';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { getCreateConfigInstructions } from '../token-acl/create-config';
import { getEnablePermissionlessThawInstructions } from '../token-acl/enable-permissionless-thaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/set-extra-metas';

/**
 * Creates a transaction to initialize a new custom token mint on Solana with user-selected extensions.
 *
 * This function allows full control over which Token-2022 extensions to enable, making it flexible
 * for any token configuration needs.
 *
 * @param rpc - The Solana RPC client instance.
 * @param name - The name of the token.
 * @param symbol - The symbol of the token.
 * @param decimals - The number of decimals for the token.
 * @param uri - The URI pointing to the token's metadata.
 * @param mintAuthority - The address with authority over the mint.
 * @param mint - The address of the mint account to initialize.
 * @param feePayer - The address that will pay the transaction fees.
 * @param options - Configuration options for extensions and authorities.
 * @returns A promise that resolves to a FullTransaction object for initializing the custom token mint.
 */
export const createCustomTokenInitTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    name: string,
    symbol: string,
    decimals: number,
    uri: string,
    mintAuthority: Address | TransactionSigner<string>,
    mint: Address | TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
    options?: {
        // Extension toggles
        enableMetadata?: boolean;
        enablePausable?: boolean;
        enablePermanentDelegate?: boolean;
        enableDefaultAccountState?: boolean;
        enableConfidentialBalances?: boolean;
        enableScaledUiAmount?: boolean;
        enableSrfc37?: boolean;
        
        // ACL mode (only relevant if SRFC-37 is enabled)
        aclMode?: 'allowlist' | 'blocklist';
        
        // Authority addresses (defaults to mintAuthority if not provided)
        metadataAuthority?: Address;
        pausableAuthority?: Address;
        permanentDelegateAuthority?: Address;
        confidentialBalancesAuthority?: Address;
        scaledUiAmountAuthority?: Address;
        
        // Scaled UI Amount configuration
        scaledUiAmountMultiplier?: number;
        scaledUiAmountNewMultiplier?: number;
        scaledUiAmountNewMultiplierEffectiveTimestamp?: bigint | number;
        
        // Default Account State configuration
        defaultAccountStateInitialized?: boolean;
        
        // Freeze authority
        freezeAuthority?: Address;
    },
): Promise<FullTransaction<TransactionVersion, TransactionMessageWithFeePayer, TransactionWithBlockhashLifetime>> => {
    const mintSigner = typeof mint === 'string' ? createNoopSigner(mint) : mint;
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const mintAuthorityAddress = typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address;
    
    const useSrfc37 = options?.enableSrfc37 ?? false;
    const aclMode = options?.aclMode ?? 'blocklist';
    
    // Default all authorities to mintAuthority if not specified
    const metadataAuthority = options?.metadataAuthority || mintAuthorityAddress;
    const pausableAuthority = options?.pausableAuthority || mintAuthorityAddress;
    const permanentDelegateAuthority = options?.permanentDelegateAuthority || mintAuthorityAddress;
    const confidentialBalancesAuthority = options?.confidentialBalancesAuthority || mintAuthorityAddress;
    const scaledUiAmountAuthority = options?.scaledUiAmountAuthority || mintAuthorityAddress;
    
    // Start building the token - Metadata is always enabled for custom tokens
    const enableMetadata = options?.enableMetadata !== false; // Default to true
    let tokenBuilder = new Token();
    
    // Add Metadata extension (required for custom tokens)
    if (enableMetadata) {
        tokenBuilder = tokenBuilder.withMetadata({
            mintAddress: mintSigner.address,
            authority: metadataAuthority,
            metadata: {
                name,
                symbol,
                uri,
            },
            additionalMetadata: new Map(),
        });
    }
    
    // Add Pausable extension
    if (options?.enablePausable) {
        tokenBuilder = tokenBuilder.withPausable(pausableAuthority);
    }
    
    // Add Permanent Delegate extension
    if (options?.enablePermanentDelegate) {
        tokenBuilder = tokenBuilder.withPermanentDelegate(permanentDelegateAuthority);
    }
    
    // Add Default Account State extension
    if (options?.enableDefaultAccountState !== undefined) {
        const initialStateInitialized = options.defaultAccountStateInitialized ?? !useSrfc37;
        tokenBuilder = tokenBuilder.withDefaultAccountState(initialStateInitialized);
    } else if (useSrfc37) {
        // If SRFC-37 is enabled but default account state is not explicitly set, default to initialized
        tokenBuilder = tokenBuilder.withDefaultAccountState(true);
    }
    
    // Add Confidential Balances extension
    if (options?.enableConfidentialBalances) {
        tokenBuilder = tokenBuilder.withConfidentialBalances(confidentialBalancesAuthority);
    }
    
    // Add Scaled UI Amount extension
    if (options?.enableScaledUiAmount) {
        tokenBuilder = tokenBuilder.withScaledUiAmount(
            scaledUiAmountAuthority,
            options.scaledUiAmountMultiplier ?? 1,
            options.scaledUiAmountNewMultiplierEffectiveTimestamp ?? 0n,
            options.scaledUiAmountNewMultiplier ?? 1,
        );
    }
    
    // Build instructions
    const instructions = await tokenBuilder.buildInstructions({
        rpc,
        decimals,
        mintAuthority,
        freezeAuthority: options?.freezeAuthority,
        mint: mintSigner,
        feePayer: feePayerSigner,
    });
    
    // If SRFC-37 is not enabled or mint authority is not the fee payer, return simple transaction
    if (mintAuthority !== feePayerSigner.address || !useSrfc37) {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        return createTransaction({
            feePayer,
            version: 'legacy',
            latestBlockhash,
            instructions,
        });
    }
    
    // SRFC-37 setup: Create Token ACL configuration
    const { instructions: createConfigInstructions } = await getCreateConfigInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });
    
    // Enable permissionless thaw
    const enablePermissionlessThawInstructions = await getEnablePermissionlessThawInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
    });
    
    // Create list (allowlist or blocklist)
    const { instructions: createListInstructions, listConfig } = await getCreateListInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        mode: aclMode === 'allowlist' ? Mode.Allow : Mode.Block,
    });
    
    // Set extra metas
    const setExtraMetasInstructions = await getSetExtraMetasInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        lists: [listConfig],
    });
    
    instructions.push(...createConfigInstructions);
    instructions.push(...enablePermissionlessThawInstructions);
    instructions.push(...createListInstructions);
    instructions.push(...setExtraMetasInstructions);
    
    // Get latest blockhash for transaction
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return createTransaction({
        feePayer,
        version: 'legacy',
        latestBlockhash,
        instructions,
    });
};







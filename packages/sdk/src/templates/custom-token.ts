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
import { TOKEN_ACL_PROGRAM_ID } from '../token-acl/utils';
import { getCreateConfigInstructions } from '../token-acl/create-config';
import { getSetGatingProgramInstructions } from '../token-acl/set-gating-program';
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
        enableTransferFee?: boolean;
        enableInterestBearing?: boolean;
        enableNonTransferable?: boolean;
        enableTransferHook?: boolean;

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

        // Transfer Fee configuration
        transferFeeAuthority?: Address;
        withdrawWithheldAuthority?: Address;
        transferFeeBasisPoints?: number;
        transferFeeMaximum?: bigint;

        // Interest Bearing configuration
        interestBearingAuthority?: Address;
        interestRate?: number;

        // Transfer Hook configuration
        transferHookAuthority?: Address;
        transferHookProgramId?: Address;
    },
): Promise<FullTransaction> => {
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

    // Add Transfer Fee extension
    if (options?.enableTransferFee) {
        // Validate transferFeeBasisPoints
        const feeBasisPoints = options.transferFeeBasisPoints ?? 0;
        if (typeof feeBasisPoints !== 'number' || !Number.isFinite(feeBasisPoints)) {
            throw new Error(
                `Invalid transferFeeBasisPoints: expected a number, got ${typeof feeBasisPoints === 'number' ? 'non-finite number' : typeof feeBasisPoints}`,
            );
        }
        if (feeBasisPoints < 0 || feeBasisPoints > 10000) {
            throw new Error(
                `Invalid transferFeeBasisPoints: ${feeBasisPoints}. Must be between 0 and 10000 inclusive (0% to 100%)`,
            );
        }
        if (!Number.isInteger(feeBasisPoints)) {
            throw new Error(`Invalid transferFeeBasisPoints: ${feeBasisPoints}. Must be an integer`);
        }

        // Validate and coerce transferFeeMaximum to bigint
        let maximumFee: bigint;
        const rawMaximumFee = options.transferFeeMaximum ?? 0n;
        try {
            maximumFee = typeof rawMaximumFee === 'bigint' ? rawMaximumFee : BigInt(rawMaximumFee);
        } catch {
            throw new Error(`Invalid transferFeeMaximum: cannot convert ${String(rawMaximumFee)} to bigint`);
        }
        if (maximumFee < 0n) {
            throw new Error(`Invalid transferFeeMaximum: ${maximumFee}. Must be non-negative`);
        }

        const transferFeeAuthority = options.transferFeeAuthority || mintAuthorityAddress;
        const withdrawWithheldAuthority = options.withdrawWithheldAuthority || mintAuthorityAddress;
        tokenBuilder = tokenBuilder.withTransferFee({
            authority: transferFeeAuthority,
            withdrawAuthority: withdrawWithheldAuthority,
            feeBasisPoints,
            maximumFee,
        });
    }

    // Add Interest Bearing extension
    if (options?.enableInterestBearing) {
        const rate = options.interestRate ?? 0;
        if (rate < 0) {
            throw new Error('Interest rate cannot be negative');
        }
        const interestBearingAuthority = options.interestBearingAuthority || mintAuthorityAddress;
        tokenBuilder = tokenBuilder.withInterestBearing({
            authority: interestBearingAuthority,
            rate,
        });
    }

    // Add Non-Transferable extension (soul-bound tokens)
    if (options?.enableNonTransferable) {
        tokenBuilder = tokenBuilder.withNonTransferable();
    }

    // Add Transfer Hook extension
    if (options?.enableTransferHook) {
        if (!options.transferHookProgramId) {
            throw new Error('transferHookProgramId is required when enableTransferHook is enabled');
        }
        const transferHookAuthority = options.transferHookAuthority || mintAuthorityAddress;
        tokenBuilder = tokenBuilder.withTransferHook({
            authority: transferHookAuthority,
            programId: options.transferHookProgramId,
        });
    }

    // Build instructions
    const instructions = await tokenBuilder.buildInstructions({
        rpc,
        decimals,
        mintAuthority,
        freezeAuthority: options?.freezeAuthority ?? (useSrfc37 ? TOKEN_ACL_PROGRAM_ID : undefined),
        mint: mintSigner,
        feePayer: feePayerSigner,
    });

    // If SRFC-37 is not enabled or mint authority is not the fee payer, return simple transaction
    if (mintAuthorityAddress !== feePayerSigner.address || !useSrfc37) {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        return pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(typeof feePayer === 'string' ? feePayer : feePayer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions(instructions, m),
        ) as FullTransaction;
    }

    // SRFC-37 setup: Create Token ACL configuration
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

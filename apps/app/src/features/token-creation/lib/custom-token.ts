import {
    generateKeyPairSigner,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    type Address,
    type Rpc,
    type SolanaRpcApi,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    TransactionModifyingSigner,
    isAddress,
    assertIsTransactionWithBlockhashLifetime,
} from '@solana/kit';
import { CustomTokenCreationResult, CustomTokenOptions } from '@/types/token';
import { createCustomTokenInitTransaction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';

/**
 * Validates custom token options and returns parsed decimals
 * @param options - Custom token configuration options
 * @returns Parsed decimals value
 * @throws Error if validation fails
 */
function validateCustomTokenOptions(options: CustomTokenOptions): number {
    if (!options.name) {
        throw new Error('Name is required');
    }
    if (!options.symbol) {
        throw new Error('Symbol is required');
    }

    const decimals = parseInt(options.decimals, 10);
    if (isNaN(decimals)) {
        throw new Error('Decimals must be a valid number');
    }
    if (decimals < 0 || decimals > 9) {
        throw new Error('Decimals must be between 0 and 9');
    }

    // Validate scaled UI amount multiplier if enabled
    if (options.enableScaledUiAmount) {
        const multiplier = options.scaledUiAmountMultiplier ? parseFloat(options.scaledUiAmountMultiplier) : 1;
        if (isNaN(multiplier)) {
            throw new Error('Scaled UI Amount multiplier must be a valid number');
        }
        if (multiplier <= 0) {
            throw new Error('Scaled UI Amount multiplier must be greater than zero');
        }
        // Validate new multiplier for scheduled/rebasing modes
        if (options.scaledUiAmountMode === 'scheduled' || 
            (options.scaledUiAmountMode === 'rebasing' && options.scaledUiAmountEffectiveTimestamp)) {
            const newMultiplier = options.scaledUiAmountNewMultiplier ? parseFloat(options.scaledUiAmountNewMultiplier) : 1;
            if (isNaN(newMultiplier)) {
                throw new Error('Scaled UI Amount new multiplier must be a valid number');
            }
            if (newMultiplier <= 0) {
                throw new Error('Scaled UI Amount new multiplier must be greater than zero');
            }
        }
    }

    // Validate Transfer Fee configuration if enabled
    if (options.enableTransferFee) {
        if (options.transferFeeBasisPoints) {
            const basisPoints = parseInt(options.transferFeeBasisPoints, 10);
            if (isNaN(basisPoints)) {
                throw new Error('Transfer fee basis points must be a valid number');
            }
            if (basisPoints < 0 || basisPoints > 10000) {
                throw new Error('Transfer fee basis points must be between 0 and 10000');
            }
        }
        if (options.transferFeeMaximum) {
            const maxFee = BigInt(options.transferFeeMaximum);
            if (maxFee < 0n) {
                throw new Error('Maximum transfer fee must be greater than or equal to zero');
            }
        }
    }

    // Validate Interest Bearing configuration if enabled
    if (options.enableInterestBearing) {
        if (options.interestRate) {
            const rate = parseInt(options.interestRate, 10);
            if (isNaN(rate)) {
                throw new Error('Interest rate must be a valid number');
            }
            if (rate < 0) {
                throw new Error('Interest rate must be greater than or equal to zero');
            }
        }
    }

    // Validate Transfer Hook configuration if enabled
    if (options.enableTransferHook) {
        if (!options.transferHookProgramId) {
            throw new Error('Transfer hook program ID is required');
        }
        if (!isAddress(options.transferHookProgramId)) {
            throw new Error('Transfer hook program ID must be a valid Solana address');
        }
    }

    // Check for conflicting extensions
    if (options.enableNonTransferable && options.enableTransferFee) {
        throw new Error('Non-transferable tokens cannot have transfer fees');
    }

    return decimals;
}

/**
 * Creates a custom token using the wallet standard transaction signer
 * @param options - Configuration options for the custom token
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to creation result with signature and mint address
 */
export const createCustomToken = async (
    options: CustomTokenOptions,
    signer: TransactionModifyingSigner,
): Promise<CustomTokenCreationResult> => {
    try {
        const decimals = validateCustomTokenOptions(options);
        const enableSrfc37 = (options.enableSrfc37 as unknown) === true || (options.enableSrfc37 as unknown) === 'true';

        // Get wallet public key
        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();

        // Generate mint keypair
        const mintKeypair = await generateKeyPairSigner();

        // Set authorities (default to signer if not provided)
        // When TokenMetadata extension is present, mintAuthority must be a TransactionSigner
        const mintAuthority = options.mintAuthority
            ? options.mintAuthority === signerAddress
                ? signer
                : (options.mintAuthority as Address)
            : signer;

        const metadataAuthority = options.metadataAuthority ? (options.metadataAuthority as Address) : undefined;
        const pausableAuthority = options.pausableAuthority ? (options.pausableAuthority as Address) : undefined;
        const confidentialBalancesAuthority = options.confidentialBalancesAuthority
            ? (options.confidentialBalancesAuthority as Address)
            : undefined;
        const permanentDelegateAuthority = options.permanentDelegateAuthority
            ? (options.permanentDelegateAuthority as Address)
            : undefined;
        const scaledUiAmountAuthority = options.scaledUiAmountAuthority
            ? (options.scaledUiAmountAuthority as Address)
            : undefined;
        const freezeAuthority = options.freezeAuthority ? (options.freezeAuthority as Address) : undefined;
        const transferFeeAuthority = options.transferFeeAuthority
            ? (options.transferFeeAuthority as Address)
            : undefined;
        const withdrawWithheldAuthority = options.withdrawWithheldAuthority
            ? (options.withdrawWithheldAuthority as Address)
            : undefined;
        const interestBearingAuthority = options.interestBearingAuthority
            ? (options.interestBearingAuthority as Address)
            : undefined;
        const transferHookAuthority = options.transferHookAuthority
            ? (options.transferHookAuthority as Address)
            : undefined;
        const transferHookProgramId = options.transferHookProgramId
            ? (options.transferHookProgramId as Address)
            : undefined;

        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Create custom token transaction using SDK
        const transaction = await createCustomTokenInitTransaction(
            rpc,
            options.name,
            options.symbol,
            decimals,
            options.uri || '',
            mintAuthority,
            mintKeypair,
            signer, // Use wallet as fee payer
            {
                enableMetadata: options.enableMetadata !== false, // Default to true
                enablePausable: options.enablePausable ?? false,
                enablePermanentDelegate: options.enablePermanentDelegate ?? false,
                enableDefaultAccountState: options.enableDefaultAccountState ?? false,
                enableConfidentialBalances: options.enableConfidentialBalances ?? false,
                enableScaledUiAmount: options.enableScaledUiAmount ?? false,
                enableSrfc37,
                enableTransferFee: options.enableTransferFee ?? false,
                enableInterestBearing: options.enableInterestBearing ?? false,
                enableNonTransferable: options.enableNonTransferable ?? false,
                enableTransferHook: options.enableTransferHook ?? false,
                aclMode: options.aclMode || 'blocklist',
                metadataAuthority,
                pausableAuthority,
                permanentDelegateAuthority,
                confidentialBalancesAuthority,
                scaledUiAmountAuthority,
                scaledUiAmountMultiplier: options.scaledUiAmountMultiplier
                    ? parseFloat(options.scaledUiAmountMultiplier)
                    : undefined,
                // For static mode: newMultiplier = multiplier, timestamp = 0
                // For scheduled/rebasing with timestamp: use provided values
                scaledUiAmountNewMultiplier: (() => {
                    const mode = options.scaledUiAmountMode || 'static';
                    if (mode === 'static') {
                        // Static mode: new multiplier equals current multiplier
                        return options.scaledUiAmountMultiplier
                            ? parseFloat(options.scaledUiAmountMultiplier)
                            : undefined;
                    }
                    // Scheduled or rebasing with scheduled first rebase
                    return options.scaledUiAmountNewMultiplier
                        ? parseFloat(options.scaledUiAmountNewMultiplier)
                        : undefined;
                })(),
                scaledUiAmountNewMultiplierEffectiveTimestamp: (() => {
                    const mode = options.scaledUiAmountMode || 'static';
                    if (mode === 'static') {
                        // Static mode: no scheduled change
                        return 0n;
                    }
                    // Scheduled or rebasing: convert ISO date to Unix timestamp
                    if (options.scaledUiAmountEffectiveTimestamp) {
                        const parsedTime = new Date(options.scaledUiAmountEffectiveTimestamp).getTime();
                        if (!Number.isFinite(parsedTime)) {
                            throw new Error(
                                `Invalid scaledUiAmountEffectiveTimestamp: "${options.scaledUiAmountEffectiveTimestamp}" is not a valid date`
                            );
                        }
                        return BigInt(Math.floor(parsedTime / 1000));
                    }
                    return 0n;
                })(),
                defaultAccountStateInitialized: options.defaultAccountStateInitialized ?? true,
                freezeAuthority,
                // Transfer Fee configuration
                transferFeeAuthority,
                withdrawWithheldAuthority,
                transferFeeBasisPoints: options.transferFeeBasisPoints
                    ? parseInt(options.transferFeeBasisPoints, 10)
                    : undefined,
                transferFeeMaximum: options.transferFeeMaximum ? BigInt(options.transferFeeMaximum) : undefined,
                // Interest Bearing configuration
                interestBearingAuthority,
                interestRate: options.interestRate ? parseInt(options.interestRate, 10) : undefined,
                // Transfer Hook configuration
                transferHookAuthority,
                transferHookProgramId,
            },
        );

        // Sign the transaction with the modifying signer
        const signedTransaction = await signTransactionMessageWithSigners(transaction);

        // Assert blockhash lifetime and send
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });

        // Build extensions list for result
        const extensions: string[] = [];
        if (options.enableMetadata !== false) extensions.push('Metadata');
        if (options.enablePausable) extensions.push('Pausable');
        if (options.enablePermanentDelegate) extensions.push('Permanent Delegate');
        if (options.enableDefaultAccountState) {
            extensions.push(
                `Default Account State (${options.defaultAccountStateInitialized !== false ? 'Initialized' : 'Frozen'})`,
            );
        }
        if (options.enableConfidentialBalances) extensions.push('Confidential Balances');
        if (options.enableScaledUiAmount) extensions.push('Scaled UI Amount');
        if (options.enableTransferFee) extensions.push('Transfer Fee');
        if (options.enableInterestBearing) extensions.push('Interest Bearing');
        if (options.enableNonTransferable) extensions.push('Non-Transferable');
        if (options.enableTransferHook) extensions.push('Transfer Hook');
        if (enableSrfc37) {
            extensions.push(`SRFC-37 (${options.aclMode === 'allowlist' ? 'Allowlist' : 'Blocklist'})`);
        }

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            mintAddress: mintKeypair.address,
            details: {
                name: options.name,
                symbol: options.symbol,
                decimals,
                aclMode: options.aclMode || 'blocklist',
                mintAuthority: typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address,
                metadataAuthority: metadataAuthority?.toString(),
                pausableAuthority: pausableAuthority?.toString(),
                confidentialBalancesAuthority: confidentialBalancesAuthority?.toString(),
                permanentDelegateAuthority: permanentDelegateAuthority?.toString(),
                scaledUiAmountAuthority: scaledUiAmountAuthority?.toString(),
                scaledUiAmountMultiplier: options.scaledUiAmountMultiplier
                    ? parseFloat(options.scaledUiAmountMultiplier)
                    : undefined,
                defaultAccountStateInitialized: options.defaultAccountStateInitialized ?? true,
                // Transfer Fee details
                transferFeeBasisPoints: options.transferFeeBasisPoints
                    ? parseInt(options.transferFeeBasisPoints, 10)
                    : undefined,
                transferFeeMaximum: options.transferFeeMaximum,
                transferFeeAuthority: transferFeeAuthority?.toString(),
                withdrawWithheldAuthority: withdrawWithheldAuthority?.toString(),
                // Interest Bearing details
                interestRate: options.interestRate ? parseInt(options.interestRate, 10) : undefined,
                interestBearingAuthority: interestBearingAuthority?.toString(),
                // Transfer Hook details
                transferHookProgramId: transferHookProgramId?.toString(),
                transferHookAuthority: transferHookAuthority?.toString(),
                extensions,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

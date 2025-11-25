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
} from 'gill';
import { CustomTokenCreationResult, CustomTokenOptions } from '@/types/token';
import { createCustomTokenInitTransaction } from '@mosaic/sdk';

/**
 * Validates custom token options and returns parsed decimals
 * @param options - Custom token configuration options
 * @returns Parsed decimals value
 * @throws Error if validation fails
 */
function validateCustomTokenOptions(options: CustomTokenOptions): number {
    if (!options.name || !options.symbol) {
        throw new Error('Name and symbol are required');
    }

    const decimals = parseInt(options.decimals, 10);
    if (isNaN(decimals) || decimals < 0 || decimals > 9) {
        throw new Error('Decimals must be a number between 0 and 9');
    }

    // Validate scaled UI amount multiplier if enabled
    if (options.enableScaledUiAmount) {
        const multiplier = options.scaledUiAmountMultiplier
            ? parseFloat(options.scaledUiAmountMultiplier)
            : 1;
        if (isNaN(multiplier) || multiplier <= 0) {
            throw new Error('Scaled UI Amount multiplier must be a positive number');
        }
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

        // Create RPC client
        const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace('http', 'ws'));

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
                aclMode: options.aclMode || 'blocklist',
                metadataAuthority,
                pausableAuthority,
                permanentDelegateAuthority,
                confidentialBalancesAuthority,
                scaledUiAmountAuthority,
                scaledUiAmountMultiplier: options.scaledUiAmountMultiplier
                    ? parseFloat(options.scaledUiAmountMultiplier)
                    : undefined,
                scaledUiAmountNewMultiplier: options.scaledUiAmountNewMultiplier
                    ? parseFloat(options.scaledUiAmountNewMultiplier)
                    : undefined,
                defaultAccountStateInitialized: options.defaultAccountStateInitialized ?? true,
                freezeAuthority,
            },
        );

        // Sign the transaction with the modifying signer
        const signedTransaction = await signTransactionMessageWithSigners(transaction);

        // Send and confirm the signed transaction
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

        // Build extensions list for result
        const extensions: string[] = [];
        if (options.enableMetadata !== false) extensions.push('Metadata');
        if (options.enablePausable) extensions.push('Pausable');
        if (options.enablePermanentDelegate) extensions.push('Permanent Delegate');
        if (options.enableDefaultAccountState) {
            extensions.push(
                `Default Account State (${options.defaultAccountStateInitialized !== false ? 'Initialized' : 'Frozen'})`
            );
        }
        if (options.enableConfidentialBalances) extensions.push('Confidential Balances');
        if (options.enableScaledUiAmount) extensions.push('Scaled UI Amount');
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







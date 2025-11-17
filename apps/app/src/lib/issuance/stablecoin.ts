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
import { StablecoinCreationResult, StablecoinOptions } from '@/types/token';
import { createStablecoinInitTransaction } from '@mosaic/sdk';

/**
 * Validates stablecoin options and returns parsed decimals
 * @param options - Stablecoin configuration options
 * @returns Parsed decimals value
 * @throws Error if validation fails
 */
function validateStablecoinOptions(options: StablecoinOptions): number {
    if (!options.name || !options.symbol) {
        throw new Error('Name and symbol are required');
    }

    const decimals = parseInt(options.decimals, 10);
    if (isNaN(decimals) || decimals < 0 || decimals > 9) {
        throw new Error('Decimals must be a number between 0 and 9');
    }

    return decimals;
}

/**
 * Creates a stablecoin using the wallet standard transaction signer
 * @param options - Configuration options for the stablecoin
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to creation result with signature and mint address
 */
export const createStablecoin = async (
    options: StablecoinOptions,
    signer: TransactionModifyingSigner,
): Promise<StablecoinCreationResult> => {
    try {
        const decimals = validateStablecoinOptions(options);
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

        // Create RPC client
        const rpcUrl = options.rpcUrl || 'https://api.devnet.solana.com';
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(rpcUrl.replace('http', 'ws'));

        // Create stablecoin transaction using SDK
        const transaction = await createStablecoinInitTransaction(
            rpc,
            options.name,
            options.symbol,
            decimals,
            options.uri || '',
            mintAuthority,
            mintKeypair,
            signer, // Use wallet as fee payer
            options.aclMode || 'blocklist',
            metadataAuthority,
            pausableAuthority,
            confidentialBalancesAuthority,
            permanentDelegateAuthority,
            enableSrfc37,
        );

        // Sign the transaction with the modifying signer
        const signedTransaction = await signTransactionMessageWithSigners(transaction);

        // Send and confirm the signed transaction
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: 'confirmed',
        });

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
                extensions: ['Metadata', 'Pausable', 'Confidential Balances', 'Permanent Delegate'],
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

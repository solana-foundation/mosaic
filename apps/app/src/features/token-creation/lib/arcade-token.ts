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
import { ArcadeTokenCreationResult, ArcadeTokenOptions } from '@/types/token';
import { createArcadeTokenInitTransaction } from '@mosaic/sdk';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';

/**
 * Validates arcade token options and returns parsed decimals
 * @param options - Arcade token configuration options
 * @returns Parsed decimals value
 * @throws Error if validation fails
 */
function validateArcadeTokenOptions(options: ArcadeTokenOptions): number {
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
 * Creates an arcade token using the wallet standard transaction signer
 * @param options - Configuration options for the arcade token
 * @param signer - Transaction sending signer instance
 * @returns Promise that resolves to creation result with signature and mint address
 */
export const createArcadeToken = async (
    options: ArcadeTokenOptions,
    signer: TransactionModifyingSigner,
): Promise<ArcadeTokenCreationResult> => {
    try {
        const decimals = validateArcadeTokenOptions(options);
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
        const permanentDelegateAuthority = options.permanentDelegateAuthority
            ? (options.permanentDelegateAuthority as Address)
            : undefined;

        // Create RPC client using standardized URL handling
        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        // Create arcade token transaction using SDK
        const transaction = await createArcadeTokenInitTransaction(
            rpc,
            options.name,
            options.symbol,
            decimals,
            options.uri || '',
            mintAuthority,
            mintKeypair,
            signer,
            metadataAuthority,
            pausableAuthority,
            permanentDelegateAuthority,
            enableSrfc37,
        );

        // Sign the transaction with the modifying signer
        const signedTransaction = await signTransactionMessageWithSigners(transaction);

        // Send and confirm the signed transaction
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
        });

        // Build extensions list for result
        const extensions: string[] = [
            'Metadata',
            'Pausable',
            'Default Account State (Allowlist)',
            'Permanent Delegate',
        ];
        if (enableSrfc37) {
            extensions.push('SRFC-37 (Allowlist)');
        }

        return {
            success: true,
            transactionSignature: getSignatureFromTransaction(signedTransaction),
            mintAddress: mintKeypair.address,
            details: {
                name: options.name,
                symbol: options.symbol,
                decimals: decimals,
                enableSrfc37: options.enableSrfc37 || false,
                mintAuthority: typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address,
                metadataAuthority: metadataAuthority?.toString(),
                pausableAuthority: pausableAuthority?.toString(),
                permanentDelegateAuthority: permanentDelegateAuthority?.toString(),
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

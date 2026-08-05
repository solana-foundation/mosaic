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
    assertIsTransactionWithBlockhashLifetime,
} from '@solana/kit';
import { StablecoinCreationResult, StablecoinOptions } from '@/types/token';
import { createStablecoinInitTransaction } from '@solana/mosaic-sdk';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';
import { assertValidAddressFields } from './validate-authorities';

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

    assertValidAddressFields(options, {
        mintAuthority: 'Mint authority',
        metadataAuthority: 'Metadata authority',
        pausableAuthority: 'Pausable authority',
        confidentialBalancesAuthority: 'Confidential balances authority',
        permanentDelegateAuthority: 'Permanent delegate authority',
        freezeAuthority: 'Freeze authority',
        auditorElgamalPubkey: 'Auditor ElGamal public key',
    });

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
        // Ignored by the SDK on the sRFC-37 path, which forces the mint authority.
        const freezeAuthority = options.freezeAuthority ? (options.freezeAuthority as Address) : undefined;
        const auditorElgamalPubkey = options.auditorElgamalPubkey?.trim()
            ? (options.auditorElgamalPubkey.trim() as Address)
            : undefined;

        // Create RPC client using standardized URL handling
        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

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
            freezeAuthority,
            {
                policy: options.confidentialBalancesPolicy,
                auditorElgamalPubkey,
            },
        );

        // Sign the transaction with the modifying signer
        const signedTransaction = await signTransactionMessageWithSigners(transaction);

        // Assert blockhash lifetime and send
        assertIsTransactionWithBlockhashLifetime(signedTransaction);
        await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
            commitment: getCommitment(),
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
                mintAuthority: mintAuthority === signer ? signer.address : (mintAuthority as Address),
                metadataAuthority: metadataAuthority?.toString(),
                pausableAuthority: pausableAuthority?.toString(),
                confidentialBalancesAuthority: confidentialBalancesAuthority?.toString(),
                permanentDelegateAuthority: permanentDelegateAuthority?.toString(),
                freezeAuthority: freezeAuthority?.toString(),
                confidentialBalancesPolicy: options.confidentialBalancesPolicy || 'whitelist',
                auditorElgamalPubkey: auditorElgamalPubkey?.toString(),
                extensions: [
                    'Metadata',
                    'Pausable',
                    // The template always adds this; `blocklist || !srfc37` decides the state.
                    `Default Account State (${
                        options.aclMode === 'blocklist' || !enableSrfc37 ? 'Initialized' : 'Frozen'
                    })`,
                    `Confidential Balances (${
                        options.confidentialBalancesPolicy === 'opt-in' ? 'Opt-in' : 'Approval required'
                    })`,
                    'Permanent Delegate',
                ],
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
};

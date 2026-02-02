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
import { TokenizedSecurityOptions, TokenizedSecurityCreationResult } from '@/types/token';
import { createTokenizedSecurityInitTransaction } from '@solana/mosaic-sdk';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';

function validateOptions(options: TokenizedSecurityOptions): number {
    if (!options.name || !options.symbol) {
        throw new Error('Name and symbol are required');
    }
    const decimals = parseInt(options.decimals, 10);
    if (isNaN(decimals) || decimals < 0 || decimals > 9) {
        throw new Error('Decimals must be a number between 0 and 9');
    }
    const multiplier = Number(options.multiplier ?? '1');
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
        throw new Error('Multiplier must be a positive number');
    }
    return decimals;
}

export const createTokenizedSecurity = async (
    options: TokenizedSecurityOptions,
    signer: TransactionModifyingSigner,
): Promise<TokenizedSecurityCreationResult> => {
    try {
        const decimals = validateOptions(options);
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

        const multiplier = Number(options.multiplier ?? '1');

        // Create RPC client using standardized URL handling
        const rpcUrl = getRpcUrl(options.rpcUrl);
        const rpc: Rpc<SolanaRpcApi> = createSolanaRpc(rpcUrl);
        const rpcSubscriptions = createSolanaRpcSubscriptions(getWsUrl(rpcUrl));

        const transaction = await createTokenizedSecurityInitTransaction(
            rpc,
            options.name,
            options.symbol,
            decimals,
            options.uri || '',
            mintAuthority,
            mintKeypair,
            signer,
            undefined, // freezeAuthority - TODO add argument for this
            {
                aclMode: options.aclMode || 'blocklist',
                enableSrfc37,
                metadataAuthority,
                pausableAuthority,
                confidentialBalancesAuthority,
                permanentDelegateAuthority,
                scaledUiAmount: {
                    authority: scaledUiAmountAuthority,
                    multiplier,
                },
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
                mintAuthority: typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address,
                metadataAuthority: metadataAuthority?.toString(),
                pausableAuthority: pausableAuthority?.toString(),
                confidentialBalancesAuthority: confidentialBalancesAuthority?.toString(),
                permanentDelegateAuthority: permanentDelegateAuthority?.toString(),
                multiplier,
                extensions: [
                    'Metadata',
                    'Pausable',
                    `Default Account State (${(options.aclMode || 'blocklist') === 'allowlist' ? 'Allowlist' : 'Blocklist'})`,
                    'Confidential Balances',
                    'Permanent Delegate',
                    'Scaled UI Amount',
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

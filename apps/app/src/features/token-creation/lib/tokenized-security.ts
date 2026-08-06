import {
    generateKeyPairSigner,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
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
import { assertValidAddressFields, toAuthorityAddress } from './validate-authorities';

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

    assertValidAddressFields(options, {
        mintAuthority: 'Mint authority',
        metadataAuthority: 'Metadata authority',
        pausableAuthority: 'Pausable authority',
        confidentialBalancesAuthority: 'Confidential balances authority',
        permanentDelegateAuthority: 'Permanent delegate authority',
        permissionedBurnAuthority: 'Permissioned burn authority',
        scaledUiAmountAuthority: 'Scaled UI amount authority',
        freezeAuthority: 'Freeze authority',
        auditorElgamalPubkey: 'Auditor ElGamal public key',
    });

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
        const requestedMintAuthority = toAuthorityAddress(options.mintAuthority);
        const mintAuthority =
            requestedMintAuthority && requestedMintAuthority !== signerAddress ? requestedMintAuthority : signer;

        const metadataAuthority = toAuthorityAddress(options.metadataAuthority);
        const pausableAuthority = toAuthorityAddress(options.pausableAuthority);
        const confidentialBalancesAuthority = toAuthorityAddress(options.confidentialBalancesAuthority);
        const permanentDelegateAuthority = toAuthorityAddress(options.permanentDelegateAuthority);
        const scaledUiAmountAuthority = toAuthorityAddress(options.scaledUiAmountAuthority);
        const permissionedBurnAuthority = toAuthorityAddress(options.permissionedBurnAuthority);
        // Ignored by the SDK on the sRFC-37 path, which forces the mint authority.
        const freezeAuthority = toAuthorityAddress(options.freezeAuthority);
        const auditorElgamalPubkey = toAuthorityAddress(options.auditorElgamalPubkey);

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
            freezeAuthority,
            {
                aclMode: options.aclMode || 'blocklist',
                enableSrfc37,
                metadataAuthority,
                pausableAuthority,
                confidentialBalancesAuthority,
                permanentDelegateAuthority,
                permissionedBurnAuthority,
                confidentialBalances: {
                    policy: options.confidentialBalancesPolicy,
                    auditorElgamalPubkey,
                },
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
                permissionedBurnAuthority: permissionedBurnAuthority?.toString(),
                scaledUiAmountAuthority: scaledUiAmountAuthority?.toString(),
                freezeAuthority: freezeAuthority?.toString(),
                confidentialBalancesPolicy: options.confidentialBalancesPolicy || 'whitelist',
                auditorElgamalPubkey: auditorElgamalPubkey?.toString(),
                multiplier,
                extensions: [
                    'Metadata',
                    'Pausable',
                    // Report the state that actually lands, not the list mode: the template
                    // uses `blocklist || !srfc37` to pick Initialized vs Frozen.
                    `Default Account State (${
                        options.aclMode === 'blocklist' || !enableSrfc37 ? 'Initialized' : 'Frozen'
                    })`,
                    `Confidential Balances (${
                        options.confidentialBalancesPolicy === 'opt-in' ? 'Opt-in' : 'Approval required'
                    })`,
                    'Permanent Delegate',
                    'Permissioned Burn',
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

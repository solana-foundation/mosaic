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
import { createCustomTokenInitTransaction } from '@solana/mosaic-sdk';
import { getRpcUrl, getWsUrl, getCommitment } from '@/lib/solana/rpc';
import { assertValidAddressFields, toAuthorityAddress } from './validate-authorities';

/**
 * Normalises a form boolean.
 *
 * `useTokenCreationForm.setOption` is typed `string | boolean`, so a boolean option can
 * arrive as the string `'true'` / `'false'` depending on which control wrote it.
 */
function asBoolean(value: unknown): boolean {
    return value === true || value === 'true';
}

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
        if (
            options.scaledUiAmountMode === 'scheduled' ||
            (options.scaledUiAmountMode === 'rebasing' && options.scaledUiAmountEffectiveTimestamp)
        ) {
            const newMultiplier = options.scaledUiAmountNewMultiplier
                ? parseFloat(options.scaledUiAmountNewMultiplier)
                : 1;
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

    // Validate Transfer Hook configuration if enabled. Compare the trimmed value, since that is
    // what gets sent — `canProceed` also trims, so an unpadded check here would pass Continue and
    // then reject at submit.
    if (options.enableTransferHook) {
        const programId = options.transferHookProgramId?.trim();
        if (!programId) {
            throw new Error('Transfer hook program ID is required');
        }
        if (!isAddress(programId)) {
            throw new Error('Transfer hook program ID must be a valid Solana address');
        }
    }

    // Every authority is cast straight to `Address` further down, so validate here rather
    // than letting a malformed string fail deep inside kit with an opaque message.
    //
    // Only the fields this mint will actually use: the form hides an authority input when its
    // extension is unticked but keeps whatever was typed, and sRFC-37 disables the freeze
    // input while the template overrides it. Validating those anyway would block submit over
    // a value the user can no longer see and the SDK would never read.
    const authorityLabels: Partial<Record<Extract<keyof CustomTokenOptions, string>, string>> = {};
    // The template forces the mint authority as freeze authority under sRFC-37, so the form
    // disables the input and whatever it holds is discarded. `hasInvalidAuthority` already
    // exempts disabled fields; match it here or Continue passes and submit throws.
    if (!asBoolean(options.enableSrfc37)) {
        authorityLabels.freezeAuthority = 'Freeze authority';
    }
    if (options.enableMetadata === false) {
        authorityLabels.mintAuthority = 'Mint authority';
    } else {
        authorityLabels.metadataAuthority = 'Metadata authority';
    }
    if (options.enablePausable) authorityLabels.pausableAuthority = 'Pausable authority';
    if (options.enablePermanentDelegate) {
        authorityLabels.permanentDelegateAuthority = 'Permanent delegate authority';
    }
    if (options.enableConfidentialBalances) {
        authorityLabels.confidentialBalancesAuthority = 'Confidential balances authority';
    }
    if (options.enableScaledUiAmount) authorityLabels.scaledUiAmountAuthority = 'Scaled UI amount authority';
    if (options.enableTransferFee) {
        authorityLabels.transferFeeAuthority = 'Transfer fee authority';
        authorityLabels.withdrawWithheldAuthority = 'Withdraw withheld authority';
    }
    if (options.enableInterestBearing) authorityLabels.interestBearingAuthority = 'Interest bearing authority';
    if (options.enableTransferHook) authorityLabels.transferHookAuthority = 'Transfer hook authority';
    assertValidAddressFields(options, authorityLabels);

    if (options.enableConfidentialBalances && options.auditorElgamalPubkey?.trim()) {
        if (!isAddress(options.auditorElgamalPubkey.trim())) {
            throw new Error('Auditor ElGamal public key must be a valid Solana address');
        }
    }

    // Token-2022 charges min(amount × basisPoints, maximumFee), so a rate with no cap
    // collects nothing at all.
    if (options.enableTransferFee) {
        const basisPoints = options.transferFeeBasisPoints ? parseInt(options.transferFeeBasisPoints, 10) : 0;
        if (basisPoints > 0 && !options.transferFeeMaximum?.trim()) {
            throw new Error('A maximum fee cap is required when the transfer fee rate is above zero');
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
        const enableSrfc37 = asBoolean(options.enableSrfc37);
        const enableDefaultAccountState = asBoolean(options.enableDefaultAccountState);
        // `true` = Initialized, `false` = Frozen. Defaults to Initialized when unset.
        const defaultAccountStateInitialized =
            options.defaultAccountStateInitialized === undefined
                ? true
                : asBoolean(options.defaultAccountStateInitialized);

        // Get wallet public key
        const walletPublicKey = signer.address;
        if (!walletPublicKey) {
            throw new Error('Wallet not connected');
        }

        const signerAddress = walletPublicKey.toString();

        // Generate mint keypair
        const mintKeypair = await generateKeyPairSigner();

        // Set authorities (default to signer if not provided)
        // When TokenMetadata extension is present, mintAuthority must be a TransactionSigner, so
        // the form only offers the field with metadata off. Honour that here too: a value typed
        // before metadata was re-enabled is still in `options`, and passing it would trip the
        // SDK's own guard over a field the user can no longer see.
        const requestedMintAuthority =
            options.enableMetadata === false ? toAuthorityAddress(options.mintAuthority) : undefined;
        const mintAuthority =
            requestedMintAuthority && requestedMintAuthority !== signerAddress ? requestedMintAuthority : signer;

        const metadataAuthority = toAuthorityAddress(options.metadataAuthority);
        const pausableAuthority = toAuthorityAddress(options.pausableAuthority);
        const confidentialBalancesAuthority = toAuthorityAddress(options.confidentialBalancesAuthority);
        const permanentDelegateAuthority = toAuthorityAddress(options.permanentDelegateAuthority);
        const scaledUiAmountAuthority = toAuthorityAddress(options.scaledUiAmountAuthority);
        const freezeAuthority = toAuthorityAddress(options.freezeAuthority);
        const transferFeeAuthority = toAuthorityAddress(options.transferFeeAuthority);
        const withdrawWithheldAuthority = toAuthorityAddress(options.withdrawWithheldAuthority);
        const interestBearingAuthority = toAuthorityAddress(options.interestBearingAuthority);
        const transferHookAuthority = toAuthorityAddress(options.transferHookAuthority);
        const transferHookProgramId = toAuthorityAddress(options.transferHookProgramId);

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
                // Send `undefined` rather than `false` when the extension is off. The SDK now
                // gates on truthiness, but a defined `false` used to still add the extension —
                // which is why every UI-created token carried DefaultAccountState.
                enableDefaultAccountState: enableDefaultAccountState || undefined,
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
                                `Invalid scaledUiAmountEffectiveTimestamp: "${options.scaledUiAmountEffectiveTimestamp}" is not a valid date`,
                            );
                        }
                        return BigInt(Math.floor(parsedTime / 1000));
                    }
                    return 0n;
                })(),
                // Left undefined when the extension is off so the SDK's aclMode-aware default
                // can fire on the sRFC-37 path.
                defaultAccountStateInitialized: enableDefaultAccountState ? defaultAccountStateInitialized : undefined,
                freezeAuthority,
                // Confidential Balances configuration
                confidentialBalances: {
                    policy: options.confidentialBalancesPolicy,
                    auditorElgamalPubkey: options.auditorElgamalPubkey?.trim()
                        ? (options.auditorElgamalPubkey.trim() as Address)
                        : undefined,
                },
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
        // sRFC-37 pulls the extension in even when it wasn't selected, so report it either way
        // rather than letting the summary disagree with the mint.
        if (enableDefaultAccountState || enableSrfc37) {
            const initialized = enableDefaultAccountState
                ? defaultAccountStateInitialized
                : options.aclMode !== 'allowlist';
            extensions.push(`Default Account State (${initialized ? 'Initialized' : 'Frozen'})`);
        }
        if (options.enableConfidentialBalances) {
            extensions.push(
                `Confidential Balances (${
                    options.confidentialBalancesPolicy === 'opt-in' ? 'Opt-in' : 'Approval required'
                })`,
            );
        }
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
                defaultAccountStateInitialized: enableDefaultAccountState ? defaultAccountStateInitialized : undefined,
                freezeAuthority: freezeAuthority?.toString(),
                // Confidential Balances details
                confidentialBalancesPolicy: options.enableConfidentialBalances
                    ? options.confidentialBalancesPolicy || 'whitelist'
                    : undefined,
                auditorElgamalPubkey: options.auditorElgamalPubkey?.trim() || undefined,
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

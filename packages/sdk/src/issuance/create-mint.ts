import type { Address, Instruction, ReadonlyUint8Array, Rpc, SolanaRpcApiMainnet, TransactionSigner } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    some,
} from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
    AccountState,
    getMintSize,
    type Extension,
    type ExtensionArgs,
    extension,
    getInitializeMintInstruction,
    getPreInitializeInstructionsForMintExtensions,
    TOKEN_2022_PROGRAM_ADDRESS,
    getInitializeTokenMetadataInstruction,
    getInitializeConfidentialTransferFeeInstruction,
} from '@solana-program/token-2022';
import { createUpdateFieldInstruction } from './create-update-field-instruction';

/**
 * The issuer's "how is the confidential-transfer extension enabled" setting:
 *   - `'opt-in'` — any holder can permissionlessly configure their own account
 *     (`autoApproveNewAccounts = true`).
 *   - `'whitelist'` — a holder's account must be approved by the confidential
 *     authority before use (`autoApproveNewAccounts = false`).
 *
 * To not enable confidential transfers at all, simply omit
 * {@link Token.withConfidentialBalances} (the extension can't be added after
 * mint creation).
 */
export type ConfidentialApprovePolicy = 'opt-in' | 'whitelist';

export interface ConfidentialBalancesOptions {
    /** Authority allowed to update the config and approve accounts. */
    authority: Address;
    /** Enable setting. Defaults to `'whitelist'`. */
    policy?: ConfidentialApprovePolicy;
    /**
     * Optional auditor ElGamal public key allowed to decode every confidential
     * transfer amount (compliance). Defaults to none.
     */
    auditorElgamalPubkey?: Address | null;
}

export interface ConfidentialMintBurnOptions {
    /**
     * The mint authority's **supply** ElGamal public key — the encrypted total
     * supply is maintained under it, and it backs the mint/burn equality proof.
     * Distinct from any per-account ElGamal key. Derive it alongside
     * {@link getConfidentialMintBurnInit} in `@solana/mosaic-sdk/confidential`.
     */
    supplyElgamalPubkey: Address;
    /**
     * The initial (zero) supply encrypted under the supply **AES** key — the
     * cheap-to-decrypt "decryptable supply". Must be produced by the same supply
     * keys as {@link supplyElgamalPubkey} (see `getConfidentialMintBurnInit`).
     * 36-byte AES ciphertext.
     */
    decryptableSupply: ReadonlyUint8Array;
}

/** Placeholder ciphertexts for extension sizing; the real values are set on-chain by init. */
const EMPTY_ENCRYPTED_BALANCE = new Uint8Array(64);

export class Token {
    private extensions: Extension[] = [];
    private confidentialTransferFeeConfig?: {
        authority: Address;
        withdrawWithheldAuthorityElGamalPubkey: Address;
    };

    getExtensions(): Extension[] {
        return this.extensions;
    }

    withMetadata({
        mintAddress,
        authority,
        metadata,
        additionalMetadata,
    }: {
        mintAddress: Address;
        metadata: {
            name: string;
            symbol: string;
            uri: string;
        };
        authority: Address;
        additionalMetadata: Map<string, string>;
    }): Token {
        const metadataExtensions = createMetadataExtensions({
            mintAddress,
            authority,
            metadata,
            additionalMetadata,
        });
        this.extensions.push(...metadataExtensions);
        return this;
    }

    withPermanentDelegate(authority: Address): Token {
        const permanentDelegateExtension = extension('PermanentDelegate', {
            delegate: authority,
        });
        this.extensions.push(permanentDelegateExtension);
        return this;
    }

    withPausable(authority: Address): Token {
        const pausableConfigExtension = extension('PausableConfig', {
            authority: some(authority),
            paused: false,
        });
        this.extensions.push(pausableConfigExtension as Extension);
        return this;
    }

    withPermissionedBurn(authority: Address): Token {
        const permissionedBurnExtension = extension('PermissionedBurn', {
            authority: some(authority),
        });
        this.extensions.push(permissionedBurnExtension as Extension);
        return this;
    }

    withDefaultAccountState(initialStateInitialized: boolean): Token {
        const defaultAccountStateExtension = extension('DefaultAccountState', {
            state: initialStateInitialized ? AccountState.Initialized : AccountState.Frozen,
        });
        this.extensions.push(defaultAccountStateExtension);
        return this;
    }

    /**
     * Adds the ConfidentialTransferMint extension to the mint, enabling
     * confidential (encrypted) balances and transfers.
     *
     * The **policy** is the issuer-facing enable setting:
     *   - `'opt-in'`: any holder can permissionlessly configure their own account
     *     for confidential transfers (`autoApproveNewAccounts = true`).
     *   - `'whitelist'` (the default): a holder's account must be approved by the
     *     confidential authority before it can be used (`autoApproveNewAccounts = false`).
     *
     * An optional **auditor** ElGamal public key lets a designated party decode
     * every confidential transfer amount for compliance.
     *
     * Backwards-compatible: pass a bare `Address` to set the authority with the
     * default (`'whitelist'`, no auditor) policy.
     *
     * @param authorityOrOptions - the confidential authority address, or an
     *   options object `{ authority, policy?, auditorElgamalPubkey? }`.
     */
    withConfidentialBalances(authorityOrOptions: Address | ConfidentialBalancesOptions): Token {
        const options: ConfidentialBalancesOptions =
            typeof authorityOrOptions === 'string' ? { authority: authorityOrOptions } : authorityOrOptions;
        const { authority, policy = 'whitelist', auditorElgamalPubkey = null } = options;

        // Only `'opt-in'` auto-approves new accounts; `'whitelist'` leaves the
        // extension gated, to be enabled later by the authority.
        const confidentialBalancesExtension = extension('ConfidentialTransferMint', {
            authority: some(authority),
            autoApproveNewAccounts: policy === 'opt-in',
            auditorElgamalPubkey: auditorElgamalPubkey ? some(auditorElgamalPubkey) : null,
        });
        this.extensions.push(confidentialBalancesExtension as Extension);
        return this;
    }

    /**
     * Adds the ConfidentialMintBurn extension to the mint, enabling tokens to be
     * minted directly into — and burned from — a confidential balance (the
     * amounts stay encrypted, unlike a plaintext deposit/withdraw).
     *
     * This is a **separate** extension from `ConfidentialTransferMint`, but a
     * mint-burn mint needs **both**: accounts must be confidential-transfer
     * configured to hold the minted balance, so pair this with
     * {@link Token.withConfidentialBalances}.
     *
     * The total supply is maintained as an encrypted (ElGamal) value plus a
     * cheap-to-decrypt AES "decryptable supply", both under the mint authority's
     * dedicated **supply keys**. Derive those keys and compute the two init
     * values with `getConfidentialMintBurnInit` from
     * `@solana/mosaic-sdk/confidential` (kept out of this WASM-free module).
     *
     * @param options - `{ supplyElgamalPubkey, decryptableSupply }` for the
     *   initial (zero) supply.
     */
    withConfidentialMintBurn(options: ConfidentialMintBurnOptions): Token {
        const confidentialMintBurnExtension = {
            __kind: 'ConfidentialMintBurn' as const,
            // Only `supplyElgamalPubkey` + `decryptableSupply` are sent on-chain
            // (via the init instruction); the ciphertext fields below are the
            // program's own state, zero-filled here purely so the extension
            // encodes to the correct on-chain size.
            confidentialSupply: EMPTY_ENCRYPTED_BALANCE,
            decryptableSupply: options.decryptableSupply,
            supplyElgamalPubkey: options.supplyElgamalPubkey,
            pendingBurn: EMPTY_ENCRYPTED_BALANCE,
        };
        this.extensions.push(confidentialMintBurnExtension as unknown as Extension);
        return this;
    }

    withScaledUiAmount(
        authority: Address,
        multiplier: number = 1,
        newMultiplierEffectiveTimestamp: bigint | number = 0,
        newMultiplier: number = 1,
    ): Token {
        const scaledUiAmountExtension = extension('ScaledUiAmountConfig', {
            authority,
            multiplier,
            newMultiplierEffectiveTimestamp:
                typeof newMultiplierEffectiveTimestamp === 'number'
                    ? BigInt(newMultiplierEffectiveTimestamp)
                    : newMultiplierEffectiveTimestamp,
            newMultiplier,
        });
        this.extensions.push(scaledUiAmountExtension as Extension);
        return this;
    }

    /**
     * Adds the TransferFee extension to the token.
     * Automatically deducts a fee from every transfer. Fees accumulate in recipient accounts
     * and can be withdrawn by the withdraw authority.
     *
     * @param config - Transfer fee configuration
     * @param config.authority - Authority that can update the fee configuration
     * @param config.withdrawAuthority - Authority that can withdraw withheld fees
     * @param config.feeBasisPoints - Fee in basis points (0-10000, where 10000 = 100%)
     * @param config.maximumFee - Maximum fee amount (in smallest token units)
     */
    withTransferFee(config: {
        authority: Address;
        withdrawAuthority: Address;
        feeBasisPoints: number;
        maximumFee: bigint;
    }): Token {
        const transferFees = {
            epoch: 0n,
            maximumFee: config.maximumFee,
            transferFeeBasisPoints: config.feeBasisPoints,
        };
        // Manually create extension object as `@solana-program/token-2022`'s extension() doesn't support TransferFeeConfig
        const transferFeeExtension = {
            __kind: 'TransferFeeConfig' as const,
            transferFeeConfigAuthority: config.authority,
            withdrawWithheldAuthority: config.withdrawAuthority,
            withheldAmount: 0n,
            newerTransferFee: transferFees,
            olderTransferFee: transferFees,
        };
        this.extensions.push(transferFeeExtension as Extension);
        return this;
    }

    /**
     * Adds the InterestBearing extension to the token.
     * Tokens continuously accrue interest based on a configured rate.
     * Interest is calculated on-chain but displayed cosmetically - no new tokens are minted.
     *
     * @param config - Interest bearing configuration
     * @param config.authority - Authority that can update the interest rate
     * @param config.rate - Interest rate in basis points (e.g., 500 = 5% annual rate)
     */
    withInterestBearing(config: { authority: Address; rate: number }): Token {
        // Manually create extension object as `@solana-program/token-2022`'s extension() doesn't support InterestBearingConfig
        const interestBearingExtension = {
            __kind: 'InterestBearingConfig' as const,
            rateAuthority: config.authority,
            initializationTimestamp: BigInt(Math.floor(Date.now() / 1000)),
            preUpdateAverageRate: config.rate,
            lastUpdateTimestamp: BigInt(Math.floor(Date.now() / 1000)),
            currentRate: config.rate,
        };
        this.extensions.push(interestBearingExtension as Extension);
        return this;
    }

    /**
     * Adds the NonTransferable extension to the token.
     * Tokens are permanently bound to the account they are minted to (soul-bound).
     * Cannot be transferred, but can be burned or the account can be closed.
     */
    withNonTransferable(): Token {
        // Manually create extension object as `@solana-program/token-2022`'s extension() doesn't support NonTransferable
        const nonTransferableExtension = {
            __kind: 'NonTransferable' as const,
        };
        this.extensions.push(nonTransferableExtension as Extension);
        return this;
    }

    /**
     * Adds the TransferHook extension to the token.
     * Executes custom program logic on every transfer.
     * Requires a deployed program implementing the transfer hook interface.
     *
     * @param config - Transfer hook configuration
     * @param config.authority - Authority that can update the hook program
     * @param config.programId - Address of the transfer hook program
     */
    withTransferHook(config: { authority: Address; programId: Address }): Token {
        // Manually create extension object as `@solana-program/token-2022`'s extension() doesn't support TransferHook
        const transferHookExtension = {
            __kind: 'TransferHook' as const,
            authority: config.authority,
            programId: config.programId,
        };
        this.extensions.push(transferHookExtension as Extension);
        return this;
    }

    /**
     * Adds the Confidential Transfer Fee extension to the token.
     * Enables confidential transfers with fees. Requires both ConfidentialTransferMint
     * and TransferFee extensions to be enabled.
     *
     * @param config - Confidential transfer fee configuration
     * @param config.authority - Authority to set the withdraw withheld authority ElGamal key
     * @param config.withdrawWithheldAuthorityElGamalPubkey - ElGamal public key for encrypted withheld fees
     */
    withConfidentialTransferFee(config: {
        authority: Address;
        withdrawWithheldAuthorityElGamalPubkey: Address;
    }): Token {
        // Check that ConfidentialTransferMint is enabled
        if (!this.extensions.some(ext => ext.__kind === 'ConfidentialTransferMint')) {
            throw new Error('ConfidentialTransferMint extension must be enabled before adding ConfidentialTransferFee');
        }
        // Check that TransferFeeConfig is enabled
        if (!this.extensions.some(ext => ext.__kind === 'TransferFeeConfig')) {
            throw new Error('TransferFeeConfig extension must be enabled before adding ConfidentialTransferFee');
        }
        this.confidentialTransferFeeConfig = config;
        return this;
    }

    async buildInstructions({
        rpc,
        decimals,
        mintAuthority,
        freezeAuthority,
        mint,
        feePayer,
    }: {
        rpc: Rpc<SolanaRpcApiMainnet>;
        decimals: number;
        mintAuthority?: Address | TransactionSigner<string>; // defaults to feePayer
        freezeAuthority?: Address; // default to feePayer
        mint: TransactionSigner<string>;
        feePayer: TransactionSigner<string>;
    }): Promise<Instruction[]> {
        // Get instructions for creating and initializing the mint account
        const mintAuthorityAddress = mintAuthority
            ? typeof mintAuthority === 'string'
                ? mintAuthority
                : mintAuthority.address
            : feePayer.address;
        const [createMintAccountInstruction, initMintInstruction] = await getCreateMintInstructions({
            rpc: rpc,
            decimals,
            // For empty extension arrays, we need to pass undefined to ensure we get the proper space calculation
            // Ref: https://github.com/solana-program/token-2022/blob/4adc1409eb4fd2c5fc3583a58e46c41f1d113176/clients/js/test/getMintSize.test.ts#L10
            extensions: this.extensions.length > 0 ? this.extensions : undefined,
            mintAuthority: mintAuthorityAddress,
            freezeAuthority: freezeAuthority ?? feePayer.address,
            mint: mint,
            payer: feePayer,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        });
        const preInitializeInstructions = this.extensions.flatMap(ext =>
            getPreInitializeInstructionsForMintExtensions(mint.address, [ext]),
        );

        // Add ConfidentialTransferFee initialization if configured
        if (this.confidentialTransferFeeConfig) {
            preInitializeInstructions.push(
                getInitializeConfidentialTransferFeeInstruction(
                    {
                        mint: mint.address,
                        authority: some(this.confidentialTransferFeeConfig.authority),
                        withdrawWithheldAuthorityElGamalPubkey:
                            this.confidentialTransferFeeConfig.withdrawWithheldAuthorityElGamalPubkey,
                    },
                    {
                        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                    },
                ),
            );
        }

        // TODO: Add other post-initialize instructions as needed like for transfer hooks
        if (
            this.extensions.some(ext => ext.__kind === 'TokenMetadata') &&
            mintAuthority &&
            typeof mintAuthority === 'string'
        ) {
            throw new Error(
                'mintAuthority must be a TransactionSigner<string> (or undefined) when TokenMetadata extension is present.',
            );
        }

        const additionalMetadataInstructions: Instruction[] = [];
        const tokenMetadataExt = this.extensions.find(ext => ext.__kind === 'TokenMetadata');
        if (tokenMetadataExt && tokenMetadataExt.__kind === 'TokenMetadata') {
            for (const [key, value] of tokenMetadataExt.additionalMetadata?.entries() ?? []) {
                additionalMetadataInstructions.push(
                    createUpdateFieldInstruction({
                        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
                        metadata: mint.address,
                        updateAuthority: mintAuthorityAddress,
                        field: key,
                        value: value,
                    }),
                );
            }
        }

        const postInitializeInstructions = this.extensions.flatMap(ext =>
            ext.__kind === 'TokenMetadata'
                ? [
                      getInitializeTokenMetadataInstruction({
                          metadata: mint.address,
                          mint: mint.address,
                          mintAuthority: (mintAuthority as TransactionSigner<string>) ?? feePayer, // safe to cast b/c we handle error case above
                          name: ext.name,
                          symbol: ext.symbol,
                          uri: ext.uri,
                          updateAuthority:
                              ext.updateAuthority.__option === 'Some'
                                  ? ext.updateAuthority.value
                                  : mintAuthorityAddress,
                      }),
                      ...additionalMetadataInstructions,
                  ]
                : [],
        );

        return [
            createMintAccountInstruction,
            ...preInitializeInstructions,
            initMintInstruction,
            ...postInitializeInstructions,
        ];
    }

    async buildTransaction({
        rpc,
        decimals,
        mintAuthority,
        freezeAuthority,
        mint,
        feePayer,
    }: {
        rpc: Rpc<SolanaRpcApiMainnet>;
        decimals: number;
        mintAuthority?: Address | TransactionSigner<string>;
        freezeAuthority?: Address;
        mint: TransactionSigner<string>;
        feePayer: TransactionSigner<string>;
    }): Promise<FullTransaction> {
        const instructions = await this.buildInstructions({
            rpc,
            decimals,
            mintAuthority,
            freezeAuthority,
            mint,
            feePayer,
        });

        // Get latest blockhash for transaction
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        return pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(feePayer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions(instructions, m),
        ) as FullTransaction;
    }
}

/**
 * Generates instructions for creating and initializing a new token mint
 * @param input Configuration parameters for mint creation
 * @returns Array of instructions for creating and initializing the mint
 */
export const getCreateMintInstructions = async (input: {
    rpc: Rpc<SolanaRpcApiMainnet>;
    decimals?: number;
    extensions?: ExtensionArgs[];
    freezeAuthority?: Address;
    mintAuthority?: Address;
    mint: TransactionSigner<string>;
    payer: TransactionSigner<string>;
    programAddress?: Address;
}): Promise<Instruction<string>[]> => {
    // Calculate required space for mint account including extensions
    const space = getMintSize(input.extensions);

    const postInitializeExtensions: Extension['__kind'][] = ['TokenMetadata'];

    // Calculate space excluding post-initialization extensions
    const spaceWithoutPostInitializeExtensions = input.extensions
        ? getMintSize(input.extensions.filter(e => !postInitializeExtensions.includes(e.__kind)))
        : space;

    // Get minimum rent-exempt balance
    const rent = await input.rpc.getMinimumBalanceForRentExemption(BigInt(space)).send();

    // Return create account and initialize mint instructions
    return [
        getCreateAccountInstruction({
            payer: input.payer,
            newAccount: input.mint,
            lamports: rent,
            space: spaceWithoutPostInitializeExtensions,
            programAddress: input.programAddress ?? TOKEN_2022_PROGRAM_ADDRESS,
        }),
        getInitializeMintInstruction(
            {
                mint: input.mint.address,
                decimals: input.decimals ?? 0,
                freezeAuthority: input.freezeAuthority,
                mintAuthority: input.mintAuthority ?? input.payer.address,
            },
            {
                programAddress: input.programAddress ?? TOKEN_2022_PROGRAM_ADDRESS,
            },
        ),
    ];
};

const createMetadataExtensions = ({
    mintAddress,
    authority,
    metadata,
    additionalMetadata,
}: {
    mintAddress: Address;
    metadata: {
        name: string;
        symbol: string;
        uri: string;
    };
    authority: Address;
    additionalMetadata: Map<string, string>;
}): Extension[] => {
    const metadataPointer = extension('MetadataPointer', {
        metadataAddress: some(mintAddress),
        authority: some(authority),
    });

    const metadataExtensionData = extension('TokenMetadata', {
        updateAuthority: some(authority),
        mint: mintAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        additionalMetadata: additionalMetadata,
    });

    return [metadataPointer, metadataExtensionData] as [Extension, Extension];
};

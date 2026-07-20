import { Token } from '../issuance';
import type { ConfidentialApprovePolicy, ConfidentialMintBurnOptions } from '../issuance/create-mint';
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
import { Mode } from '@solana/token-acl-gate-sdk';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { getCreateConfigInstructions } from '../token-acl/create-config';
import { getSetGatingProgramInstructions } from '../token-acl/set-gating-program';
import { getEnablePermissionlessThawInstructions } from '../token-acl/enable-permissionless-thaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/set-extra-metas';

/**
 * Creates a transaction to initialize a new tokenized security mint on Solana.
 * Matches the stablecoin template extensions, plus Scaled UI Amount.
 */
export const createTokenizedSecurityInitTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    name: string,
    symbol: string,
    decimals: number,
    uri: string,
    mintAuthority: Address | TransactionSigner<string>,
    mint: Address | TransactionSigner<string>,
    feePayer: Address | TransactionSigner<string>,
    freezeAuthority?: Address,
    options?: {
        aclMode?: 'allowlist' | 'blocklist';
        metadataAuthority?: Address;
        pausableAuthority?: Address;
        confidentialBalancesAuthority?: Address;
        confidentialPolicy?: ConfidentialApprovePolicy;
        auditorElgamalPubkey?: Address;
        confidentialMintBurn?: ConfidentialMintBurnOptions;
        permanentDelegateAuthority?: Address;
        permissionedBurnAuthority?: Address;
        enableSrfc37?: boolean;
        scaledUiAmount?: {
            authority?: Address;
            multiplier?: number;
            newMultiplierEffectiveTimestamp?: bigint | number;
            newMultiplier?: number;
        };
    },
): Promise<FullTransaction> => {
    const mintSigner = typeof mint === 'string' ? createNoopSigner(mint) : mint;
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const mintAuthoritySigner = typeof mintAuthority === 'string' ? createNoopSigner(mintAuthority) : mintAuthority;
    const mintAuthorityAddress = typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address;

    const aclMode = options?.aclMode ?? 'blocklist';
    const useSrfc37 = options?.enableSrfc37 ?? false;
    const metadataAuthority = options?.metadataAuthority || mintAuthorityAddress;
    const pausableAuthority = options?.pausableAuthority || mintAuthorityAddress;
    const confidentialBalancesAuthority = options?.confidentialBalancesAuthority || mintAuthorityAddress;
    const permanentDelegateAuthority = options?.permanentDelegateAuthority || mintAuthorityAddress;
    const permissionedBurnAuthority = options?.permissionedBurnAuthority || mintAuthorityAddress;

    let tokenBuilder = new Token()
        .withMetadata({
            mintAddress: mintSigner.address,
            authority: metadataAuthority,
            metadata: {
                name,
                symbol,
                uri,
            },
            additionalMetadata: new Map(),
        })
        .withPausable(pausableAuthority)
        // Blocklist sRFC-37 still needs DefaultAccountState=Frozen so new ATAs
        // default frozen and the permissionless-thaw path against the blocklist fires.
        .withDefaultAccountState(aclMode === 'blocklist' || !useSrfc37)
        .withConfidentialBalances({
            authority: confidentialBalancesAuthority,
            policy: options?.confidentialPolicy,
            auditorElgamalPubkey: options?.auditorElgamalPubkey,
        })
        .withPermanentDelegate(permanentDelegateAuthority)
        .withPermissionedBurn(permissionedBurnAuthority);

    // ConfidentialMintBurn needs ConfidentialTransferMint (added above) to hold the
    // minted balance; both extensions must be present on the mint.
    if (options?.confidentialMintBurn) {
        tokenBuilder = tokenBuilder.withConfidentialMintBurn(options.confidentialMintBurn);
    }

    // Add Scaled UI Amount extension
    tokenBuilder = tokenBuilder.withScaledUiAmount(
        options?.scaledUiAmount?.authority || mintAuthorityAddress,
        options?.scaledUiAmount?.multiplier ?? 1,
        options?.scaledUiAmount?.newMultiplierEffectiveTimestamp ?? 0n,
        options?.scaledUiAmount?.newMultiplier ?? 1,
    );

    const instructions = await tokenBuilder.buildInstructions({
        rpc,
        decimals,
        mintAuthority: mintAuthority,
        // On the sRFC-37 path the freeze authority MUST be the mint authority: the
        // Token-ACL `create_config` instruction requires the mint's current freeze
        // authority to equal its signer (the mint authority) and then reassigns it to
        // the config PDA itself. Pre-setting it to anything else (e.g. the program id)
        // fails create_config with InvalidAuthority.
        freezeAuthority: useSrfc37 ? mintAuthorityAddress : freezeAuthority,
        mint: mintSigner,
        feePayer: feePayerSigner,
    });

    if (!useSrfc37) {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        return pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(typeof feePayer === 'string' ? feePayer : feePayer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions(instructions, m),
        ) as FullTransaction;
    }

    // The on-chain authority for Token-ACL/ABL setup stays the mint authority so the
    // derived config/list PDAs are keyed off custody and later custody-signed
    // mutations (addToList, thaw) succeed. Account creation is funded by the fee
    // payer via `payer`, allowing a sponsored (e.g. Kora) deploy where feePayer !== mintAuthority.
    const { instructions: createConfigInstructions } = await getCreateConfigInstructions({
        authority: mintAuthoritySigner,
        payer: feePayerSigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    const setGatingProgramInstructions = await getSetGatingProgramInstructions({
        authority: mintAuthoritySigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    const enablePermissionlessThawInstructions = await getEnablePermissionlessThawInstructions({
        authority: mintAuthoritySigner,
        mint: mintSigner.address,
    });

    const { instructions: createListInstructions, listConfig } = await getCreateListInstructions({
        authority: mintAuthoritySigner,
        payer: feePayerSigner,
        mint: mintSigner.address,
        mode: aclMode === 'allowlist' ? Mode.Allow : Mode.Block,
    });

    const setExtraMetasInstructions = await getSetExtraMetasInstructions({
        authority: mintAuthoritySigner,
        payer: feePayerSigner,
        mint: mintSigner.address,
        addresses: [listConfig],
    });

    instructions.push(...createConfigInstructions);
    instructions.push(...setGatingProgramInstructions);
    instructions.push(...enablePermissionlessThawInstructions);
    instructions.push(...createListInstructions);
    instructions.push(...setExtraMetasInstructions);

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(typeof feePayer === 'string' ? feePayer : feePayer.address, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

import { Token } from '../issuance';
import type { Rpc, Address, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    none,
} from '@solana/kit';
import { getUpdateTransferHookInstruction, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { Mode } from '@token-acl/abl-sdk';
import { ABL_PROGRAM_ID } from '../abl/utils';
import { TOKEN_ACL_PROGRAM_ID } from '../token-acl/utils';
import { getCreateConfigInstructions } from '../token-acl/create-config';
import { getSetGatingProgramInstructions } from '../token-acl/set-gating-program';
import { getEnablePermissionlessThawInstructions } from '../token-acl/enable-permissionless-thaw';
import { getCreateListInstructions } from '../abl/list';
import { getSetExtraMetasInstructions } from '../abl/set-extra-metas';

/**
 * Creates a transaction to initialize a Money Market Fund (MMF) mint.
 *
 * Extensions: Metadata, Pausable, DefaultAccountState (frozen), PermanentDelegate,
 * TransferHook (programId set to null after init), and optional ConfidentialBalances.
 *
 * Transfer restrictions are enforced via pause + freeze rather than a transfer hook program.
 * The TransferHook extension is initialized so the mint can adopt a hook program later
 * without re-creating the mint.
 */
export const createMmfInitTransaction = async (
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
        permanentDelegateAuthority?: Address;
        transferHookAuthority?: Address | TransactionSigner<string>;
        enableConfidentialBalances?: boolean;
        enableSrfc37?: boolean;
    },
): Promise<FullTransaction> => {
    const mintSigner = typeof mint === 'string' ? createNoopSigner(mint) : mint;
    const feePayerSigner = typeof feePayer === 'string' ? createNoopSigner(feePayer) : feePayer;
    const mintAuthorityAddress = typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address;

    const aclMode = options?.aclMode ?? 'allowlist';
    const useSrfc37 = options?.enableSrfc37 ?? false;

    // SRFC-37 setup is signed by feePayer, and the mint's freeze authority is set to
    // TOKEN_ACL_PROGRAM_ID before the config account exists. If we early-out without
    // installing the config (e.g. because mintAuthority !== feePayer), the mint is left
    // with TOKEN_ACL_PROGRAM_ID as freeze authority and no config — bricked. Refuse upfront.
    if (useSrfc37 && mintAuthorityAddress !== feePayerSigner.address) {
        throw new Error(
            'createMmfInitTransaction: enableSrfc37 requires mintAuthority === feePayer. ' +
                'Either pass the same signer for both, or disable enableSrfc37 and configure SRFC-37 separately.',
        );
    }

    const metadataAuthority = options?.metadataAuthority || mintAuthorityAddress;
    const pausableAuthority = options?.pausableAuthority || mintAuthorityAddress;
    const permanentDelegateAuthority = options?.permanentDelegateAuthority || mintAuthorityAddress;
    // transferHookAuthority must sign UpdateTransferHook below. Default to the mintAuthority
    // input (preserving its TransactionSigner if provided) so the existing signer covers it.
    // Callers that want a different key MUST pass a TransactionSigner here — passing a bare
    // Address only works if some other instruction in the same tx already attaches a signer
    // for that address, otherwise signTransactionMessageWithSigners will leave it unsigned.
    const transferHookAuthorityInput: Address | TransactionSigner<string> =
        options?.transferHookAuthority ?? mintAuthority;
    const transferHookAuthorityAddress =
        typeof transferHookAuthorityInput === 'string'
            ? transferHookAuthorityInput
            : transferHookAuthorityInput.address;
    const enableConfidential = options?.enableConfidentialBalances ?? false;

    let tokenBuilder = new Token()
        .withMetadata({
            mintAddress: mintSigner.address,
            authority: metadataAuthority,
            metadata: { name, symbol, uri },
            additionalMetadata: new Map(),
        })
        .withPausable(pausableAuthority)
        // MMF design: accounts always start frozen. Issuer thaws via freeze auth on mint/transfer.
        .withDefaultAccountState(false)
        .withPermanentDelegate(permanentDelegateAuthority)
        // Initialize with placeholder programId; cleared to null below.
        .withTransferHook({
            authority: transferHookAuthorityAddress,
            programId: transferHookAuthorityAddress,
        });

    if (enableConfidential) {
        const confidentialBalancesAuthority = options?.confidentialBalancesAuthority || mintAuthorityAddress;
        tokenBuilder = tokenBuilder.withConfidentialBalances(confidentialBalancesAuthority);
    }

    const instructions = await tokenBuilder.buildInstructions({
        rpc,
        decimals,
        mintAuthority,
        freezeAuthority: freezeAuthority ?? (useSrfc37 ? TOKEN_ACL_PROGRAM_ID : undefined),
        mint: mintSigner,
        feePayer: feePayerSigner,
    });

    // Clear the transfer hook program id so the extension is present but inert.
    // Pass the resolved input (Signer-or-Address) so a custom Signer flows through and the
    // kit attaches it to the ix; otherwise we rely on mintAuthority's signature covering it.
    instructions.push(
        getUpdateTransferHookInstruction(
            {
                mint: mintSigner.address,
                authority: transferHookAuthorityInput,
                programId: none(),
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
    );

    if (!useSrfc37) {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        return pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(typeof feePayer === 'string' ? feePayer : feePayer.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions(instructions, m),
        ) as FullTransaction;
    }

    const { instructions: createConfigInstructions } = await getCreateConfigInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    const setGatingProgramInstructions = await getSetGatingProgramInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        gatingProgram: ABL_PROGRAM_ID,
    });

    const enablePermissionlessThawInstructions = await getEnablePermissionlessThawInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
    });

    const { instructions: createListInstructions, listConfig } = await getCreateListInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        mode: aclMode === 'allowlist' ? Mode.Allow : Mode.Block,
    });

    const setExtraMetasInstructions = await getSetExtraMetasInstructions({
        authority: feePayerSigner,
        mint: mintSigner.address,
        lists: [listConfig],
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

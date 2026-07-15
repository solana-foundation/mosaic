import { Token } from '../issuance';
import type { Rpc, Address, SolanaRpcApi, TransactionSigner } from '@solana/kit';
import type { FullTransaction } from '../transaction-util';
import {
    createNoopSigner,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    none,
} from '@solana/kit';
import { getUpdateTransferHookInstruction, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { Mode } from '@solana/token-acl-gate-sdk';
import { ABL_PROGRAM_ID } from '../abl/utils';
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
 *
 * Accounts default to frozen, so a freeze authority is mandatory: if `freezeAuthority` is
 * omitted it defaults to the mint authority. On the SRFC-37 path the freeze authority is
 * always the mint authority — the Token-ACL `create_config` instruction validates it and
 * then reassigns freeze authority to its config PDA. This prevents minting a mint whose
 * accounts can never be thawed.
 *
 * Transaction size: when `enableSrfc37` is true, the returned transaction appends the full
 * SRFC-37 setup (createConfig, setGatingProgram, enablePermissionlessThaw, createList,
 * setExtraMetas) on top of mint initialization. Combined with the extension set — especially
 * when `enableConfidentialBalances` is also true — this may exceed Solana's 1232-byte
 * serialized transaction limit. There is no pre-flight size check here; if the transaction
 * is rejected as too large, split the SRFC-37 setup into a follow-up transaction by calling
 * this with `enableSrfc37: false` and configuring SRFC-37 separately.
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
    const mintAuthoritySigner = typeof mintAuthority === 'string' ? createNoopSigner(mintAuthority) : mintAuthority;
    const mintAuthorityAddress = typeof mintAuthority === 'string' ? mintAuthority : mintAuthority.address;

    const aclMode = options?.aclMode ?? 'allowlist';
    const useSrfc37 = options?.enableSrfc37 ?? false;

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

    // MMF accounts default to frozen, so a freeze authority is required to ever thaw them.
    // On the SRFC-37 path the freeze authority MUST be the mint authority: `create_config`
    // validates it as the current freeze authority and then reassigns it to the config PDA.
    // Otherwise fall back to the mint authority so the mint isn't left permanently unusable.
    const resolvedFreezeAuthority = useSrfc37 ? mintAuthorityAddress : (freezeAuthority ?? mintAuthorityAddress);

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
        freezeAuthority: resolvedFreezeAuthority,
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
            m => setTransactionMessageFeePayerSigner(feePayerSigner, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstructions(instructions, m),
        ) as FullTransaction;
    }

    // The on-chain authority for Token-ACL/ABL setup is the mint authority (which is also the
    // mint's freeze authority, so create_config validates and then reassigns it to the config
    // PDA). Account creation is funded by the fee payer via `payer`, allowing a sponsored
    // (e.g. Kora) deploy where feePayer !== mintAuthority.
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
        m => setTransactionMessageFeePayerSigner(feePayerSigner, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;
};

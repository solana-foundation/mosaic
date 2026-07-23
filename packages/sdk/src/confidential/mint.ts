import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchMint, fetchToken } from '@solana-program/token-2022';
import { getConfidentialMintInstructionPlan } from '@solana-program/token-2022/confidential';
import type { ConfidentialKeys } from './keys';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util';

type DecodedMint = Awaited<ReturnType<typeof fetchMint>>;
type DecodedToken = Awaited<ReturnType<typeof fetchToken>>;

/** Whether a decoded mint carries the `ConfidentialMintBurn` extension. */
function isConfidentialMintBurn(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialMintBurn')
    );
}

/** Whether a decoded mint carries the `ConfidentialTransferMint` extension. */
function isConfidentialTransferMint(mint: DecodedMint): boolean {
    return (
        mint.data.extensions.__option === 'Some' &&
        mint.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferMint')
    );
}

/** Whether a decoded token account carries the `ConfidentialTransferAccount` extension. */
function isConfidentialTransferAccount(token: DecodedToken): boolean {
    return (
        token.data.extensions.__option === 'Some' &&
        token.data.extensions.value.some(e => e.__kind === 'ConfidentialTransferAccount')
    );
}

/**
 * Confidentially **mints** tokens directly into a confidential balance,
 * increasing the encrypted total supply. Unlike a plaintext mint + deposit, the
 * amount never appears on-chain in the clear.
 *
 * Wraps the official `getConfidentialMintInstructionPlan`, which generates the
 * three required proofs (ciphertext-commitment equality, grouped ciphertext
 * validity, U128 range) and wires them through context-state accounts; the
 * resulting plan spans multiple transactions (proof setup → mint → cleanup).
 *
 * Reads the mint (for decimals + supply state) and the destination account, and
 * adds the Mosaic value-adds: decimal `TokenAmount` handling and a
 * both-extensions-required fail-fast. The mint must carry **both**
 * `ConfidentialMintBurn` and `ConfidentialTransferMint`, and the destination
 * account must be confidential-transfer configured. The upstream helper resolves
 * the auditor from the decoded mint unless overridden.
 */
export async function createConfidentialMintInstructionPlan(input: {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi & SolanaRpcApi>;
    /** Pays for the context-state account rent. */
    payer: TransactionSigner;
    /** The token mint (must carry `ConfidentialMintBurn`). */
    mint: Address;
    /** Destination confidential token account (where the minted balance lands). */
    destinationToken: Address;
    /** The mint authority. A bare address becomes a no-op signer. */
    authority: Address | TransactionSigner;
    /** Amount to mint — decimal string (e.g. `"1.5"`) or raw `bigint`. */
    amount: TokenAmount;
    /** The mint authority's supply keys (ElGamal keypair + AES key). */
    supplyKeys: ConfidentialKeys;
    /** Override the auditor pubkey; defaults to the mint's configured auditor. */
    auditorElgamalPubkey?: Address;
}): Promise<InstructionPlan> {
    const [mintDecoded, destinationDecoded] = await Promise.all([
        fetchMint(input.rpc, input.mint),
        fetchToken(input.rpc, input.destinationToken),
    ]);

    // Fail fast with actionable messages rather than letting the upstream helper
    // throw deep in the stack. The mint must be confidential-mint/burn configured,
    // and (since the minted balance is confidential) also confidential-transfer
    // configured; the destination account must be confidential-transfer configured.
    if (!isConfidentialMintBurn(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} is not configured for confidential mint/burn ` +
                `(missing the ConfidentialMintBurn extension).`,
        );
    }
    if (!isConfidentialTransferMint(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} has ConfidentialMintBurn but not ConfidentialTransferMint; ` +
                `both are required for confidential mint.`,
        );
    }
    if (!isConfidentialTransferAccount(destinationDecoded)) {
        throw new Error(
            `Token account ${input.destinationToken} is not configured for confidential transfers ` +
                `(missing the ConfidentialTransferAccount extension). Configure it first with ` +
                `createConfigureConfidentialAccountInstructionPlan.`,
        );
    }

    const amount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);

    return getConfidentialMintInstructionPlan({
        rpc: input.rpc,
        payer: input.payer,
        token: input.destinationToken,
        mint: input.mint,
        mintAccount: mintDecoded.data,
        destinationTokenAccount: destinationDecoded.data,
        authority: toAuthoritySigner(input.authority),
        amount,
        supplyElgamalKeypair: input.supplyKeys.elgamal,
        supplyAesKey: input.supplyKeys.aes,
        auditorElgamalPubkey: input.auditorElgamalPubkey,
    });
}

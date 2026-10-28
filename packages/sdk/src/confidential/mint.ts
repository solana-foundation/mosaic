import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchMint, fetchToken } from '@solana-program/token-2022';
import {
    getConfidentialMintInstructionPlan,
    getConfidentialMintWithRecordInstructionPlan,
} from '@solana-program/token-2022/confidential';
import {
    getConfidentialMintBurnSupplyElgamalPubkey,
    isConfidentialMintBurn,
    isConfidentialTransferAccount,
    isConfidentialTransferMint,
} from './extensions.js';
import { assertConfidentialKeysMatchSupply, type ConfidentialKeys } from './keys.js';
import {
    type RecordBackedProof,
    type TokenAmount,
    toRecordProofArgs,
    tokenAmountToRaw,
    toAuthoritySigner,
} from './util.js';

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
    /**
     * The mint's supply keys (ElGamal keypair + AES key) — `deriveConfidentialKeys`
     * for the **supply authority**, the dedicated wallet the mint was created with.
     * Proof material, not a signer, so it need not be the mint `authority`.
     * Checked against the mint's registered supply pubkey before use.
     */
    supplyKeys: ConfidentialKeys;
    /** Override the auditor pubkey; defaults to the mint's configured auditor. */
    auditorElgamalPubkey?: Address;
    /**
     * Stage the batched range proof in an SPL Record account instead of inline in
     * the verify instruction data. Pass this (`{}` is enough) when sending with an
     * executor that sets compute-unit limits — see {@link RecordBackedProof}.
     */
    recordBackedProof?: RecordBackedProof;
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
    // The plan is a multi-transaction sequence: its proof-setup transactions run
    // (and fund three rent-paying context-state accounts) before the mint itself
    // reaches the chain. A mint mismatch caught only on-chain would therefore fail
    // the mint *and* skip the cleanup transaction, stranding that rent.
    if (destinationDecoded.data.mint !== input.mint) {
        throw new Error(
            `Token account ${input.destinationToken} belongs to mint ${destinationDecoded.data.mint}, ` +
                `not ${input.mint}.`,
        );
    }
    if (!isConfidentialTransferAccount(destinationDecoded)) {
        throw new Error(
            `Token account ${input.destinationToken} is not configured for confidential transfers ` +
                `(missing the ConfidentialTransferAccount extension). Configure it first with ` +
                `createConfigureConfidentialAccountInstructionPlan.`,
        );
    }
    // Supply keys come from a dedicated supply-authority wallet and cannot be
    // re-derived from the mint, so the wrong wallet is an easy mistake — catch it
    // here rather than as an on-chain proof rejection inside the upstream helper.
    const registeredSupplyPubkey = getConfidentialMintBurnSupplyElgamalPubkey(mintDecoded);
    if (registeredSupplyPubkey !== null) {
        assertConfidentialKeysMatchSupply(input.supplyKeys, registeredSupplyPubkey, input.mint);
    }

    const amount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);

    const args = {
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
    };

    if (input.recordBackedProof !== undefined) {
        return getConfidentialMintWithRecordInstructionPlan({
            ...args,
            ...toRecordProofArgs(input.recordBackedProof),
        });
    }
    return getConfidentialMintInstructionPlan(args);
}

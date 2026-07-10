import {
    type Address,
    type GetMinimumBalanceForRentExemptionApi,
    type InstructionPlan,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
} from '@solana/kit';
import { fetchMint, fetchToken, getConfidentialMintInstruction } from '@solana-program/token-2022';
import { type ConfidentialKeys, decryptAesBalance } from './keys';
import { buildMintProofData } from './mint-burn-proof';
import {
    assembleConfidentialMintBurnPlan,
    getAccountElgamalPubkey,
    getConfidentialMintBurnExtension,
    getMintAuditorElgamalPubkey,
    isConfidentialTransferMint,
} from './mint-burn-util';
import { type TokenAmount, tokenAmountToRaw, toAuthoritySigner } from './util';

/**
 * Confidentially **mints** tokens directly into a confidential balance,
 * increasing the encrypted total supply. Unlike a plaintext mint + deposit, the
 * amount never appears on-chain in the clear.
 *
 * There is no upstream `InstructionPlan` helper for confidential mint, so this
 * generates the three required proofs (ciphertext-commitment equality, grouped
 * ciphertext validity, U128 range) via `mint-burn-proof.ts` and wires them
 * through context-state accounts (see {@link assembleConfidentialMintBurnPlan}).
 * The resulting plan spans multiple transactions: proof setup → mint → cleanup.
 *
 * The mint must carry **both** `ConfidentialMintBurn` and
 * `ConfidentialTransferMint`, and the destination account must be
 * confidential-transfer configured; otherwise this fails fast.
 *
 * The current supply is read (and decrypted with the supply AES key) from the
 * mint's decryptable supply; the auditor is detected from the mint unless
 * overridden.
 *
 * ⚠️ The equality proof binds the decrypted decryptable supply to the on-chain
 * ElGamal `confidentialSupply` ciphertext. `applyPendingBurn` updates the ElGamal
 * ciphertext but cannot update the AES decryptable supply (the program has no
 * access to the supply AES key), so the two drift after a burn is applied. Minting
 * against a stale decryptable supply produces a proof the chain rejects with an
 * opaque error. After any `applyPendingBurn`, re-sync first with
 * {@link createUpdateConfidentialMintBurnDecryptableSupplyInstructionPlan} (from
 * `@solana/mosaic-sdk/confidential`) before calling this.
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

    // Fail fast: the mint must be confidential-mint/burn configured, and (since
    // the minted balance is confidential) also confidential-transfer configured.
    const mintBurnExt = getConfidentialMintBurnExtension(mintDecoded, input.mint);
    if (!isConfidentialTransferMint(mintDecoded)) {
        throw new Error(
            `Mint ${input.mint} has ConfidentialMintBurn but not ConfidentialTransferMint; ` +
                `both are required for confidential mint.`,
        );
    }

    const rawAmount = tokenAmountToRaw(input.amount, mintDecoded.data.decimals);
    const currentSupply = decryptAesBalance(input.supplyKeys.aes, new Uint8Array(mintBurnExt.decryptableSupply));
    const destinationElgamalPubkey = getAccountElgamalPubkey(destinationDecoded, input.destinationToken);
    const auditorElgamalPubkey = input.auditorElgamalPubkey ?? getMintAuditorElgamalPubkey(mintDecoded);

    const proof = buildMintProofData({
        currentSupplyCiphertext: new Uint8Array(mintBurnExt.confidentialSupply),
        currentSupply,
        mintAmount: rawAmount,
        supplyElgamalKeypair: input.supplyKeys.elgamal,
        supplyAesKey: input.supplyKeys.aes,
        destinationElgamalPubkey,
        auditorElgamalPubkey,
    });

    const authority = toAuthoritySigner(input.authority);
    return assembleConfidentialMintBurnPlan({
        rpc: input.rpc,
        payer: input.payer,
        proof,
        buildTokenInstruction: records =>
            getConfidentialMintInstruction({
                token: input.destinationToken,
                mint: input.mint,
                equalityRecord: records.equalityRecord,
                ciphertextValidityRecord: records.ciphertextValidityRecord,
                rangeRecord: records.rangeRecord,
                authority,
                newDecryptableSupply: proof.newDecryptableBalance,
                mintAmountAuditorCiphertextLo: proof.auditorCiphertextLo,
                mintAmountAuditorCiphertextHi: proof.auditorCiphertextHi,
                // 0 = read each proof from its context-state account.
                equalityProofInstructionOffset: 0,
                ciphertextValidityProofInstructionOffset: 0,
                rangeProofInstructionOffset: 0,
            }),
    });
}

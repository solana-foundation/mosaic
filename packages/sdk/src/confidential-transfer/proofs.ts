import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import {
    RANGE_PROOF_PADDING_BIT_LENGTH,
    REMAINING_BALANCE_BIT_LENGTH,
    TRANSFER_AMOUNT_HI_BITS,
    TRANSFER_AMOUNT_LO_BITS,
} from './constants';
import {
    fetchDecodedMint,
    fetchDecodedTokenAccount,
    getConfidentialTransferAccountExtension,
    getConfidentialTransferMintExtension,
    getExtensions,
    unwrapAddressOption,
} from './accounts';
import {
    combineTransferAmountCiphertexts,
    groupedCiphertextCommitment,
    groupedCiphertextSourceCiphertextBytes,
    subtractCiphertext,
    aeCiphertextFromBytes,
} from './ciphertext';
import { addressToElgamalPubkey, deriveConfidentialTransferKeys } from './key-derivation';
import { loadZkSdk } from './zk-sdk';
import type { ConfidentialTransferAuthoritySigner } from './types';

export async function buildConfidentialTransferProofs(input: {
    rpc: Rpc<SolanaRpcApi>;
    mint: Address;
    sourceTokenAccount: Address;
    destinationTokenAccount: Address;
    authority: ConfidentialTransferAuthoritySigner<string>;
    amount: bigint;
}) {
    const zk = await loadZkSdk();
    const decodedMint = await fetchDecodedMint(input.rpc, input.mint);
    const mintExtensions = getExtensions(decodedMint.data);
    const confidentialMint = getConfidentialTransferMintExtension(mintExtensions);

    const sourceToken = await fetchDecodedTokenAccount(input.rpc, input.sourceTokenAccount);
    const destinationToken = await fetchDecodedTokenAccount(input.rpc, input.destinationTokenAccount);
    const sourceConfidentialAccount = getConfidentialTransferAccountExtension(getExtensions(sourceToken.data));
    const destinationConfidentialAccount = getConfidentialTransferAccountExtension(
        getExtensions(destinationToken.data),
    );

    const { elgamalKeypair, aesKey } = await deriveConfidentialTransferKeys({
        authority: input.authority,
        tokenAccount: input.sourceTokenAccount,
        zk,
    });
    const currentAvailableBalance = aesKey.decrypt(
        aeCiphertextFromBytes(zk, sourceConfidentialAccount.decryptableAvailableBalance),
    );
    if (currentAvailableBalance < input.amount) {
        throw new Error(`Insufficient confidential balance: have ${currentAvailableBalance}, need ${input.amount}`);
    }
    const newAvailableBalance = currentAvailableBalance - input.amount;

    const destinationElgamalPubkey = addressToElgamalPubkey(zk, destinationConfidentialAccount.elgamalPubkey);
    const auditorElgamalPubkey = addressToElgamalPubkey(zk, unwrapAddressOption(confidentialMint.auditorElgamalPubkey));

    const lowAmountMask = (1n << TRANSFER_AMOUNT_LO_BITS) - 1n;
    const amountLow = input.amount & lowAmountMask;
    const amountHigh = input.amount >> TRANSFER_AMOUNT_LO_BITS;
    if (amountHigh >= 1n << BigInt(TRANSFER_AMOUNT_HI_BITS)) {
        throw new Error('Transfer amount exceeds confidential transfer proof bit length');
    }

    const openingLow = new zk.PedersenOpening();
    const openingHigh = new zk.PedersenOpening();
    const groupedCiphertextLow = zk.GroupedElGamalCiphertext3Handles.encryptWith(
        elgamalKeypair.pubkey(),
        destinationElgamalPubkey,
        auditorElgamalPubkey,
        amountLow,
        openingLow,
    );
    const groupedCiphertextHigh = zk.GroupedElGamalCiphertext3Handles.encryptWith(
        elgamalKeypair.pubkey(),
        destinationElgamalPubkey,
        auditorElgamalPubkey,
        amountHigh,
        openingHigh,
    );
    const groupedCiphertextLowBytes = groupedCiphertextLow.toBytes();
    const groupedCiphertextHighBytes = groupedCiphertextHigh.toBytes();

    const sourceCiphertextLow = groupedCiphertextSourceCiphertextBytes(groupedCiphertextLowBytes, 0);
    const sourceCiphertextHigh = groupedCiphertextSourceCiphertextBytes(groupedCiphertextHighBytes, 0);
    const transferAmountAuditorCiphertextLo = groupedCiphertextSourceCiphertextBytes(groupedCiphertextLowBytes, 2);
    const transferAmountAuditorCiphertextHi = groupedCiphertextSourceCiphertextBytes(groupedCiphertextHighBytes, 2);
    const transferAmountSourceCiphertext = combineTransferAmountCiphertexts(sourceCiphertextLow, sourceCiphertextHigh);
    const newAvailableBalanceCiphertext = subtractCiphertext(
        zk,
        sourceConfidentialAccount.availableBalance,
        transferAmountSourceCiphertext,
    );

    const newAvailableBalanceOpening = new zk.PedersenOpening();
    const newAvailableBalanceCommitment = zk.PedersenCommitment.from(newAvailableBalance, newAvailableBalanceOpening);
    const equalityProof = new zk.CiphertextCommitmentEqualityProofData(
        elgamalKeypair,
        newAvailableBalanceCiphertext,
        newAvailableBalanceCommitment,
        newAvailableBalanceOpening,
        newAvailableBalance,
    );
    const ciphertextValidityProof = new zk.BatchedGroupedCiphertext3HandlesValidityProofData(
        elgamalKeypair.pubkey(),
        destinationElgamalPubkey,
        auditorElgamalPubkey,
        groupedCiphertextLow,
        groupedCiphertextHigh,
        amountLow,
        amountHigh,
        openingLow,
        openingHigh,
    );
    const paddingOpening = new zk.PedersenOpening();
    const paddingCommitment = zk.PedersenCommitment.from(0n, paddingOpening);
    const rangeProof = new zk.BatchedRangeProofU128Data(
        [
            newAvailableBalanceCommitment,
            groupedCiphertextCommitment(zk, groupedCiphertextLowBytes),
            groupedCiphertextCommitment(zk, groupedCiphertextHighBytes),
            paddingCommitment,
        ],
        new BigUint64Array([newAvailableBalance, amountLow, amountHigh, 0n]),
        new Uint8Array([
            REMAINING_BALANCE_BIT_LENGTH,
            Number(TRANSFER_AMOUNT_LO_BITS),
            TRANSFER_AMOUNT_HI_BITS,
            RANGE_PROOF_PADDING_BIT_LENGTH,
        ]),
        [newAvailableBalanceOpening, openingLow, openingHigh, paddingOpening],
    );

    return {
        newDecryptableAvailableBalance: aesKey.encrypt(newAvailableBalance).toBytes(),
        transferAmountAuditorCiphertextLo,
        transferAmountAuditorCiphertextHi,
        equalityProof,
        ciphertextValidityProof,
        rangeProof,
    };
}

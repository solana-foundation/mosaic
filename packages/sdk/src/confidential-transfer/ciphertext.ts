import { RistrettoPoint } from '@noble/curves/ed25519';
import {
    ELGAMAL_CIPHERTEXT_LENGTH,
    GROUPED_ELGAMAL_3_HANDLES_LENGTH,
    POINT_LENGTH,
    TRANSFER_AMOUNT_LO_BITS,
} from './constants';
import { mutableBytes } from './bytes';
import type { ZkElGamalCiphertext, ZkPedersenCommitment, ZkSdk } from './zk-sdk';

type RistrettoPointInstance = ReturnType<typeof RistrettoPoint.fromBytes>;

export function ciphertextFromBytes(zk: ZkSdk, bytes: ArrayLike<number>): ZkElGamalCiphertext {
    const ciphertext = zk.ElGamalCiphertext.fromBytes(mutableBytes(bytes));
    if (!ciphertext) {
        throw new Error('Invalid ElGamal ciphertext bytes');
    }
    return ciphertext;
}

export function aeCiphertextFromBytes(zk: ZkSdk, bytes: ArrayLike<number>) {
    const ciphertext = zk.AeCiphertext.fromBytes(mutableBytes(bytes));
    if (!ciphertext) {
        throw new Error('Invalid decryptable balance bytes');
    }
    return ciphertext;
}

function pointFromBytes(bytes: Uint8Array): RistrettoPointInstance {
    return RistrettoPoint.fromBytes(mutableBytes(bytes));
}

function pointToBytes(point: RistrettoPointInstance): Uint8Array {
    return mutableBytes(point.toBytes());
}

function multiplyPoint(point: RistrettoPointInstance, scalar: bigint): RistrettoPointInstance {
    return scalar === 0n ? RistrettoPoint.ZERO : point.multiply(scalar);
}

function encodeCiphertext(commitment: RistrettoPointInstance, handle: RistrettoPointInstance): Uint8Array {
    const bytes = new Uint8Array(ELGAMAL_CIPHERTEXT_LENGTH);
    bytes.set(pointToBytes(commitment), 0);
    bytes.set(pointToBytes(handle), POINT_LENGTH);
    return bytes;
}

function splitCiphertext(bytes: Uint8Array): { commitment: RistrettoPointInstance; handle: RistrettoPointInstance } {
    if (bytes.length !== ELGAMAL_CIPHERTEXT_LENGTH) {
        throw new Error(`Expected ${ELGAMAL_CIPHERTEXT_LENGTH} bytes for an ElGamal ciphertext`);
    }
    return {
        commitment: pointFromBytes(bytes.slice(0, POINT_LENGTH)),
        handle: pointFromBytes(bytes.slice(POINT_LENGTH, ELGAMAL_CIPHERTEXT_LENGTH)),
    };
}

export function subtractPublicAmountFromCiphertext(
    zk: ZkSdk,
    ciphertext: ArrayLike<number>,
    amount: bigint,
): ZkElGamalCiphertext {
    const { commitment, handle } = splitCiphertext(mutableBytes(ciphertext));
    const amountCommitment = multiplyPoint(RistrettoPoint.BASE, amount);
    return ciphertextFromBytes(zk, encodeCiphertext(commitment.subtract(amountCommitment), handle));
}

export function groupedCiphertextSourceCiphertextBytes(groupedCiphertext: Uint8Array, handleIndex: number): Uint8Array {
    if (groupedCiphertext.length !== GROUPED_ELGAMAL_3_HANDLES_LENGTH) {
        throw new Error(`Expected ${GROUPED_ELGAMAL_3_HANDLES_LENGTH} bytes for a 3-handle grouped ciphertext`);
    }
    const bytes = new Uint8Array(ELGAMAL_CIPHERTEXT_LENGTH);
    bytes.set(groupedCiphertext.slice(0, POINT_LENGTH), 0);
    const handleOffset = POINT_LENGTH * (1 + handleIndex);
    bytes.set(groupedCiphertext.slice(handleOffset, handleOffset + POINT_LENGTH), POINT_LENGTH);
    return bytes;
}

export function combineTransferAmountCiphertexts(
    ciphertextLow: Uint8Array,
    ciphertextHigh: Uint8Array,
): { commitment: RistrettoPointInstance; handle: RistrettoPointInstance } {
    const low = splitCiphertext(ciphertextLow);
    const high = splitCiphertext(ciphertextHigh);
    const highMultiplier = 1n << TRANSFER_AMOUNT_LO_BITS;
    return {
        commitment: low.commitment.add(multiplyPoint(high.commitment, highMultiplier)),
        handle: low.handle.add(multiplyPoint(high.handle, highMultiplier)),
    };
}

export function subtractCiphertext(
    zk: ZkSdk,
    leftCiphertext: ArrayLike<number>,
    rightCiphertext: { commitment: RistrettoPointInstance; handle: RistrettoPointInstance },
): ZkElGamalCiphertext {
    const left = splitCiphertext(mutableBytes(leftCiphertext));
    return ciphertextFromBytes(
        zk,
        encodeCiphertext(
            left.commitment.subtract(rightCiphertext.commitment),
            left.handle.subtract(rightCiphertext.handle),
        ),
    );
}

export function groupedCiphertextCommitment(zk: ZkSdk, groupedCiphertext: Uint8Array): ZkPedersenCommitment {
    return zk.PedersenCommitment.fromBytes(groupedCiphertext.slice(0, POINT_LENGTH));
}

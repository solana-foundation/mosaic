import {
    type Address,
    createSignableMessage,
    getAddressDecoder,
    getAddressEncoder,
    type MessagePartialSigner,
} from '@solana/kit';
import { assertConfidentialTransferMessageSigner } from './authority';
import { POINT_LENGTH } from './constants';
import { mutableBytes } from './bytes';
import { loadZkSdk, type ZkAeKey, type ZkElGamalKeypair, type ZkElGamalPubkey, type ZkSdk } from './zk-sdk';

const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

async function signDerivationMessages(
    signer: MessagePartialSigner<string>,
    messages: Uint8Array[],
): Promise<Uint8Array[]> {
    assertConfidentialTransferMessageSigner(signer);
    const signatures = await signer.signMessages(messages.map(message => createSignableMessage(message)));
    return signatures.map(signatureDictionary => {
        const signature = signatureDictionary[signer.address];
        if (!signature || signature.length !== 64) {
            throw new Error(`Signer ${signer.address} did not produce a 64-byte derivation signature`);
        }
        return signature;
    });
}

export async function deriveConfidentialTransferKeys(input: {
    authority: MessagePartialSigner<string>;
    tokenAccount: Address;
    zk?: ZkSdk;
}): Promise<{ elgamalKeypair: ZkElGamalKeypair; aesKey: ZkAeKey }> {
    const zk = input.zk ?? (await loadZkSdk());
    const tokenAccountBytes = mutableBytes(addressEncoder.encode(input.tokenAccount));
    const [elgamalSignature, aesSignature] = await signDerivationMessages(input.authority, [
        zk.ElGamalKeypair.signerMessage(tokenAccountBytes),
        zk.AeKey.signerMessage(tokenAccountBytes),
    ]);

    return {
        elgamalKeypair: zk.ElGamalKeypair.fromSignature(elgamalSignature),
        aesKey: zk.AeKey.fromSignature(aesSignature),
    };
}

export function elgamalPubkeyToAddress(pubkey: ZkElGamalPubkey): Address {
    return addressDecoder.decode(pubkey.toBytes());
}

export function addressToElgamalPubkey(zk: ZkSdk, pubkey: Address | null | undefined): ZkElGamalPubkey {
    return zk.ElGamalPubkey.fromBytes(
        pubkey ? mutableBytes(addressEncoder.encode(pubkey)) : new Uint8Array(POINT_LENGTH),
    );
}

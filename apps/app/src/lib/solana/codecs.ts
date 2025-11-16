import { getBase58Decoder, type Signature, type SignatureBytes } from 'gill';

export function getSignatureFromBytes(signatureBytes: SignatureBytes): Signature {
    return getBase58Decoder().decode(signatureBytes) as Signature;
}

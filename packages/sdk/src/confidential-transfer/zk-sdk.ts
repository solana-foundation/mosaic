export type ZkSdk = typeof import('@solana/zk-sdk/node');
export type ZkElGamalKeypair = ReturnType<ZkSdk['ElGamalKeypair']['fromSignature']>;
export type ZkElGamalPubkey = ReturnType<ZkSdk['ElGamalPubkey']['fromBytes']>;
export type ZkElGamalCiphertext = NonNullable<ReturnType<ZkSdk['ElGamalCiphertext']['fromBytes']>>;
export type ZkAeKey = ReturnType<ZkSdk['AeKey']['fromSignature']>;
export type ZkPedersenCommitment = ReturnType<ZkSdk['PedersenCommitment']['from']>;

export async function loadZkSdk(): Promise<ZkSdk> {
    if (typeof window === 'undefined') {
        return import('@solana/zk-sdk/node');
    }
    return import('@solana/zk-sdk/bundler') as Promise<ZkSdk>;
}

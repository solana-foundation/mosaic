import { type Address, fetchEncodedAccount, type Rpc, type SolanaRpcApi } from 'gill';
import { TOKEN_2022_PROGRAM_ADDRESS, decodeMint } from 'gill/programs';

export const getTokenExtensions = async (rpc: Rpc<SolanaRpcApi>, mintAddress: Address): Promise<string[]> => {
    const encodedAccount = await fetchEncodedAccount(rpc, mintAddress);

    if (!encodedAccount.exists) {
        throw new Error('Mint account not found');
    }

    // Check if this is a Token-2022 mint
    if (encodedAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
        throw new Error(`Not a Token-2022 mint (owner: ${encodedAccount.programAddress})`);
    }

    // Decode mint data using gill's decodeMint
    const decodedMint = decodeMint(encodedAccount);

    // Get extensions
    const presentExtensions: string[] = [];

    if (decodedMint.data.extensions && decodedMint.data.extensions.__option === 'Some') {
        for (const ext of decodedMint.data.extensions.value) {
            if (ext.__kind) {
                presentExtensions.push(ext.__kind);
            }
        }
    }

    return presentExtensions;
};

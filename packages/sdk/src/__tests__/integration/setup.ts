import {
    airdropFactory,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    generateKeyPairSigner,
    lamports,
    type Rpc,
    type RpcSubscriptions,
    type SolanaRpcApi,
    type SolanaRpcSubscriptionsApi,
    type TransactionSigner,
} from 'gill';

export interface Client {
    rpc: Rpc<SolanaRpcApi>;
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

export interface TestSuite {
    client: Client;
    walletsToAirdrop: TransactionSigner<string>[];
    mintAuthority: TransactionSigner<string>;
    freezeAuthority: TransactionSigner<string>;
    payer: TransactionSigner<string>;
    stableMint: TransactionSigner<string>;
    arcadeTokenMint: TransactionSigner<string>;
    tokenizedSecurityMint: TransactionSigner<string>;
}

const LAMPORTS_PER_SOL = 1_000_000_000;
const CONFIG = {
    SOLANA_RPC_URL: 'http://127.0.0.1:8899',
    SOLANA_WS_URL: 'ws://127.0.0.1:8900',
    SOL_DROP_AMOUNT: lamports(BigInt(LAMPORTS_PER_SOL)),
};

async function setupTestSuite(): Promise<TestSuite> {
    // Create Solana client
    const rpc = createSolanaRpc(CONFIG.SOLANA_RPC_URL);
    const rpcSubscriptions = createSolanaRpcSubscriptions(CONFIG.SOLANA_WS_URL);
    const airdrop = airdropFactory({ rpc, rpcSubscriptions });
    const client: Client = { rpc, rpcSubscriptions };

    // Get or create keypairs
    const mintAuthority = await generateKeyPairSigner();
    const freezeAuthority = await generateKeyPairSigner();
    const payer = await generateKeyPairSigner();
    const stableMint = await generateKeyPairSigner();
    const arcadeTokenMint = await generateKeyPairSigner();
    const tokenizedSecurityMint = await generateKeyPairSigner();

    // Airdrop SOL to possible payers
    const walletsToAirdrop = [payer, freezeAuthority, mintAuthority];
    await Promise.all(
        walletsToAirdrop.map(async recipient => {
            return airdrop({
                commitment: 'processed',
                lamports: CONFIG.SOL_DROP_AMOUNT,
                recipientAddress: recipient.address,
            });
        }),
    );

    return {
        client,
        walletsToAirdrop,
        mintAuthority,
        freezeAuthority,
        payer,
        stableMint,
        arcadeTokenMint,
        tokenizedSecurityMint,
    };
}

export default setupTestSuite;

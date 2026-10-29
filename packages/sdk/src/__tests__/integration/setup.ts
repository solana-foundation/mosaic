import {
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    generateKeyPairSigner,
    type Rpc,
    type RpcSubscriptions,
    type SolanaRpcApi,
    type SolanaRpcSubscriptionsApi,
    type TransactionSigner,
} from '@solana/kit';
import { RPC_URL, WS_URL } from './env.js';
import { airdropAndWait } from './polling.js';

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

async function setupTestSuite(): Promise<TestSuite> {
    // Create Solana client
    const rpc = createSolanaRpc(RPC_URL);
    // Unused by the shared helpers (they confirm over HTTP polling), but part of the Client type.
    const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
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
    await Promise.all(walletsToAirdrop.map(recipient => airdropAndWait(rpc, recipient.address, 1)));

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

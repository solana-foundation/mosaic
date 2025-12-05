import type {
    Address,
    Rpc,
    SolanaRpcApi,
    TransactionMessageWithFeePayer,
    TransactionVersion,
    TransactionMessageWithBlockhashLifetime,
    Commitment,
    Signature,
} from '@solana/kit';
import type { FullTransaction } from '../../transaction-util';
import {
    getSignatureFromTransaction,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
} from '@solana/kit';
import type { Client } from './setup';
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
    inspectToken,
    type AclMode,
    type ScaledUiAmountInfo,
    type TokenAuthorities,
    type TokenExtension,
    type TokenMetadata,
    type TokenSupplyInfo,
    type TokenType,
} from '../../inspection';

export const DEFAULT_TIMEOUT = 60000;
export const DEFAULT_COMMITMENT = 'processed';

export const describeSkipIf = (condition?: boolean) => (condition ? describe.skip : describe);

/**
 * Submit a transaction and wait for confirmation
 */
export async function sendAndConfirmTransaction(
    client: Client,
    tx: FullTransaction,
    commitment: Commitment = DEFAULT_COMMITMENT,
    skipPreflight = true,
): Promise<Signature> {
    // Sign transaction
    const signedTransaction = await signTransactionMessageWithSigners(tx);

    // Get signature and wire transaction
    const signature = getSignatureFromTransaction(signedTransaction);
    await sendAndConfirmTransactionFactory(client)(signedTransaction as any, {
        commitment,
        skipPreflight,
    });

    return signature;
}

/**
 * Get token balance for a wallet
 */
export async function getBalance(
    rpc: Rpc<SolanaRpcApi>,
    wallet: Address,
    mint: Address,
    commitment: Commitment = DEFAULT_COMMITMENT,
): Promise<bigint> {
    const [ata] = await findAssociatedTokenPda({ owner: wallet, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });

    const accountInfo = await rpc.getAccountInfo(ata, { encoding: 'jsonParsed', commitment }).send();

    if (!accountInfo?.value?.data) {
        return 0n;
    }

    const balance = await rpc.getTokenAccountBalance(ata, { commitment }).send();
    return BigInt(balance.value.amount);
}

/**
 * Check if an account is frozen
 */
export async function isAccountFrozen(rpc: Rpc<SolanaRpcApi>, wallet: Address, mint: Address): Promise<boolean> {
    const [ata] = await findAssociatedTokenPda({ owner: wallet, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, mint });

    const accountInfo = await rpc.getAccountInfo(ata, { encoding: 'jsonParsed' }).send();

    if (!accountInfo?.value?.data) {
        return false;
    }

    const parsed = (accountInfo.value.data as any).parsed?.info;
    return parsed?.state === 'frozen';
}

/**
 * Assert transaction succeeded
 */
export function assertTxSuccess(signature: string): void {
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
}

export async function assertMemo(
    rpc: Rpc<SolanaRpcApi>,
    transactionId: Signature,
    memo: string,
    commitment: Commitment = 'confirmed', // method doesn't support processed commitment
): Promise<void> {
    const transaction = await rpc.getTransaction(transactionId, { commitment, encoding: 'base64' }).send();
    const logs = transaction?.meta?.logMessages;
    expect(transaction?.meta?.logMessages).toBeDefined();
    const joinedLogs = logs?.join('\n');
    expect(joinedLogs).toContain(`${memo}`);
}

/**
 * Assert transaction fails
 */
export async function assertTxFailure(client: Client, transactionToThrow: FullTransaction): Promise<void> {
    await expect(sendAndConfirmTransaction(client, transactionToThrow)).rejects.toThrow();
}

/**
 * Assert single balance for a wallet
 */
export async function assertBalance(
    rpc: Rpc<SolanaRpcApi>,
    wallet: Address,
    mint: Address,
    expectedAmount: bigint,
    commitment: Commitment = DEFAULT_COMMITMENT,
): Promise<void> {
    let balance: bigint;
    try {
        balance = await getBalance(rpc, wallet, mint, commitment);
    } catch {
        balance = 0n;
    }
    expect(balance).toBe(expectedAmount);
}

/**
 * Assert multiple balances at once
 */
export async function assertBalances(
    rpc: Rpc<SolanaRpcApi>,
    assertions: Array<{
        wallet: Address;
        mint: Address;
        expectedAmount: bigint;
    }>,
    commitment: Commitment = DEFAULT_COMMITMENT,
): Promise<void> {
    await Promise.all(
        assertions.map(assertion =>
            assertBalance(rpc, assertion.wallet, assertion.mint, assertion.expectedAmount, commitment),
        ),
    );
}

export interface AssertTokenOptions {
    exists?: boolean;
    supplyInfo?: TokenSupplyInfo;
    authorities?: Partial<TokenAuthorities>;
    extensions?: TokenExtension[];
    tokenType?: TokenType;
    isPausable?: boolean;
    aclMode?: AclMode;
    enableSrfc37?: boolean;
    scaledUiAmount?: ScaledUiAmountInfo;
    metadata?: TokenMetadata;
}

/**
 * Assert token state matches expected values
 */
export async function assertToken(
    rpc: Rpc<SolanaRpcApi>,
    mintAddress: Address,
    expected: AssertTokenOptions,
    commitment: Commitment = DEFAULT_COMMITMENT,
): Promise<void> {
    const exists = expected.exists ?? true;
    const tokenInspection = inspectToken(rpc, mintAddress, commitment);

    // Verify token status
    if (!exists) {
        await expect(tokenInspection).rejects.toThrow();
        return;
    }
    const inspection = await tokenInspection;
    expect(inspection).toBeDefined();
    expect(inspection.programId).toBe(TOKEN_2022_PROGRAM_ADDRESS);
    expect(inspection.isToken2022).toBe(true);

    // Verify authorities
    if (expected.authorities) {
        for (const authority of Object.keys(expected.authorities) as Array<keyof TokenAuthorities>) {
            expect(inspection.authorities[authority]).toBe(expected.authorities[authority]);
        }
    }

    // Verify token type
    if (expected.tokenType) {
        expect(inspection.detectedPatterns).toContain(expected.tokenType);
    }

    // Verify supply info
    if (expected.supplyInfo) {
        expect(inspection.supplyInfo).toEqual(expected.supplyInfo);
    }

    // Verify extensions (use partial matching to handle null/undefined differences)
    if (expected.extensions) {
        for (const expectedExtension of expected.extensions) {
            const matchingExtension = inspection.extensions.find(ext => ext.name === expectedExtension.name);
            expect(matchingExtension).toBeDefined();
            expect(matchingExtension).toMatchObject(expectedExtension);
        }
    }

    // Verify is pausable
    if (expected.isPausable !== undefined) {
        expect(inspection.isPausable).toBe(expected.isPausable);
    }

    // Verify acl mode
    if (expected.aclMode) {
        expect(inspection.aclMode).toBe(expected.aclMode);
    }

    // Verify enable Srfc37
    if (expected.enableSrfc37 !== undefined) {
        expect(inspection.enableSrfc37).toBe(expected.enableSrfc37);
    }

    // Verify scaled UI amount
    if (expected.scaledUiAmount) {
        expect(inspection.scaledUiAmount).toEqual(expected.scaledUiAmount);
    }

    // Verify metadata
    if (expected.metadata) {
        if (expected.metadata.name) {
            expect(inspection.metadata?.name).toBe(expected.metadata.name);
        }
        if (expected.metadata.symbol) {
            expect(inspection.metadata?.symbol).toBe(expected.metadata.symbol);
        }
        if (expected.metadata.uri) {
            expect(inspection.metadata?.uri).toBe(expected.metadata.uri);
        }
        if (expected.metadata.updateAuthority) {
            expect(inspection.metadata?.updateAuthority).toBe(expected.metadata.updateAuthority.toString());
        }
        if (expected.metadata.additionalMetadata) {
            for (const [key, value] of expected.metadata.additionalMetadata.entries()) {
                expect(inspection.metadata?.additionalMetadata?.get(key)).toBe(value);
            }
        }
    }
}

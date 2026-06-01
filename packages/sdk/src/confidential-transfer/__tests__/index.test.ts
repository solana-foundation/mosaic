import type { Address, Rpc, SolanaRpcApi } from '@solana/kit';
import { generateKeyPairSigner } from '@solana/kit';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { createMockRpc, seedMintDetails } from '../../__tests__/test-utils';
import {
    assertConfidentialTransferAuthorityMatchesSigner,
    assertConfidentialTransferMessageSigner,
    CONFIDENTIAL_TRANSFER_UNSUPPORTED_WALLET_MESSAGE,
    createConfigureConfidentialTransferAccountInstructions,
    createConfidentialDepositTransaction,
    createConfidentialTransferAccountSnapshot,
    createConfidentialTransferOperationPlan,
    executeConfidentialOperationPlan,
    createHarvestConfidentialTransferFeesTransaction,
    createSetConfidentialCreditsTransaction,
    createSingleTransactionConfidentialOperationPlan,
    createUpdateConfidentialTransferMintTransaction,
    getConfidentialTransferFeeCapability,
    parseConfidentialTransferAddress,
    parseConfidentialTransferSourceAccounts,
    refreshTransactionBlockhash,
    type ConfidentialTransferPlan,
    ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS,
} from '../index';
import { parseDecimalAmount } from '../accounts';

describe('confidential transfer SDK helpers', () => {
    let rpc: Rpc<SolanaRpcApi>;
    const mint = 'Mint777777777777777777777777777777777777777' as Address;
    const tokenAccount = 'TokenAcct77777777777777777777777777777777' as Address;

    beforeEach(() => {
        rpc = createMockRpc();
    });

    it('builds configure-account instructions with reallocation and pubkey proof', async () => {
        const owner = await generateKeyPairSigner();
        const feePayer = await generateKeyPairSigner();

        const result = await createConfigureConfidentialTransferAccountInstructions({
            rpc,
            mint,
            owner: owner.address,
            authority: owner,
            feePayer,
        });

        expect(result.tokenAccount).toBeDefined();
        expect(result.elgamalPubkey).toBeDefined();
        expect(result.instructions).toHaveLength(4);
        expect(result.instructions[0].programAddress).toBe('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
        expect(result.instructions[1].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(result.instructions[2].programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(result.instructions[3].programAddress).toBe(ZK_ELGAMAL_PROOF_PROGRAM_ADDRESS);
        expect(result.instructions[3]!.data![0]).toBe(4); // VerifyPubkeyValidity
    });

    it('fails clearly when a confidential signer cannot sign messages', () => {
        expect(() =>
            assertConfidentialTransferMessageSigner({
                address: tokenAccount,
            }),
        ).toThrow(CONFIDENTIAL_TRANSFER_UNSUPPORTED_WALLET_MESSAGE);
    });

    it('fails clearly when the requested confidential authority differs from the local signer', async () => {
        const authority = await generateKeyPairSigner();
        const localSigner = await generateKeyPairSigner();

        expect(() =>
            assertConfidentialTransferAuthorityMatchesSigner({
                requestedAuthority: authority.address,
                signerAddress: localSigner.address,
            }),
        ).toThrow(`--authority (${authority.address})`);
    });

    it('builds a confidential deposit transaction', async () => {
        const owner = await generateKeyPairSigner();
        const feePayer = await generateKeyPairSigner();
        seedMintDetails(rpc, { address: mint, decimals: 2 });

        const transaction = await createConfidentialDepositTransaction({
            rpc,
            mint,
            owner: owner.address,
            authority: owner,
            feePayer,
            amount: '12.34',
            tokenAccount,
        });

        expect(transaction.instructions).toHaveLength(1);
        expect(transaction.instructions[0]!.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(transaction.instructions[0]!.data![0]).toBe(27); // Confidential transfer instruction wrapper
        expect(transaction.instructions[0]!.data![1]).toBe(5); // Deposit
    });

    it('parses confidential decimal amounts without floating-point precision loss', () => {
        expect(parseDecimalAmount('9007199.254740991', 9)).toBe(9007199254740991n);
        expect(parseDecimalAmount('0.000000001', 9)).toBe(1n);
        expect(() => parseDecimalAmount('1.0000000001', 9)).toThrow('more fractional digits');
    });

    it('builds credit toggle transactions', async () => {
        const authority = await generateKeyPairSigner();
        const transaction = await createSetConfidentialCreditsTransaction({
            rpc,
            tokenAccount,
            authority,
            feePayer: authority,
            enabled: false,
        });

        expect(transaction.instructions).toHaveLength(1);
        expect(transaction.instructions[0]!.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(transaction.instructions[0]!.data![0]).toBe(27);
        expect(transaction.instructions[0]!.data![1]).toBe(10); // DisableConfidentialCredits
    });

    it('builds a confidential mint update transaction', async () => {
        const authority = await generateKeyPairSigner();
        const auditorElgamalPubkey = await generateKeyPairSigner();

        const transaction = await createUpdateConfidentialTransferMintTransaction({
            rpc,
            mint,
            authority,
            feePayer: authority,
            autoApproveNewAccounts: true,
            auditorElgamalPubkey: auditorElgamalPubkey.address,
        });

        expect(transaction.instructions).toHaveLength(1);
        expect(transaction.instructions[0]!.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(transaction.instructions[0]!.data![0]).toBe(27);
        expect(transaction.instructions[0]!.data![1]).toBe(1); // UpdateConfidentialTransferMint
    });

    it('builds a confidential fee harvest transaction', async () => {
        const authority = await generateKeyPairSigner();
        const source = await generateKeyPairSigner();

        const transaction = await createHarvestConfidentialTransferFeesTransaction({
            rpc,
            mint,
            sources: [source.address],
            feePayer: authority,
        });

        expect(transaction.instructions).toHaveLength(1);
        expect(transaction.instructions[0]!.programAddress).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(transaction.instructions[0]!.data![0]).toBe(37);
        expect(transaction.instructions[0]!.data![1]).toBe(3); // HarvestWithheldTokensToMint
    });

    it('requires at least one source account when harvesting confidential fees', async () => {
        const authority = await generateKeyPairSigner();

        await expect(
            createHarvestConfidentialTransferFeesTransaction({
                rpc,
                mint,
                sources: [],
                feePayer: authority,
            }),
        ).rejects.toThrow('At least one source token account is required');
    });

    it('parses and validates confidential transfer address inputs', async () => {
        const sourceA = await generateKeyPairSigner();
        const sourceB = await generateKeyPairSigner();

        expect(parseConfidentialTransferAddress(sourceA.address, 'source')).toBe(sourceA.address);
        expect(parseConfidentialTransferSourceAccounts(`${sourceA.address}, ${sourceB.address}`)).toEqual([
            sourceA.address,
            sourceB.address,
        ]);
        expect(() => parseConfidentialTransferSourceAccounts('not-an-address')).toThrow(
            'source 1 must be a valid Solana address',
        );
        expect(() => parseConfidentialTransferSourceAccounts('', { required: true })).toThrow(
            'At least one source token account is required',
        );
    });

    it('creates a single-transaction operation plan', async () => {
        const authority = await generateKeyPairSigner();
        const source = await generateKeyPairSigner();
        const transaction = await createHarvestConfidentialTransferFeesTransaction({
            rpc,
            mint,
            sources: [source.address],
            feePayer: authority,
        });

        const plan = createSingleTransactionConfidentialOperationPlan({
            label: 'Harvest fees',
            transaction,
        });

        expect(plan.cleanupPolicy).toBe('none');
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({
            label: 'Harvest fees',
            phase: 'main',
        });
        expect(plan.steps[0]!.transaction).toBe(transaction);
    });

    it('creates a confidential transfer operation plan with setup, main, and cleanup phases', async () => {
        const authority = await generateKeyPairSigner();
        const source = await generateKeyPairSigner();
        const transaction = await createHarvestConfidentialTransferFeesTransaction({
            rpc,
            mint,
            sources: [source.address],
            feePayer: authority,
        });
        const transferPlan: ConfidentialTransferPlan = {
            sourceTokenAccount: tokenAccount,
            destinationTokenAccount: source.address,
            contextStateAccounts: {
                equality: source.address,
                ciphertextValidity: source.address,
                range: source.address,
            },
            setupTransactions: [transaction, transaction],
            transferTransaction: transaction,
            cleanupTransaction: transaction,
        };

        const operationPlan = createConfidentialTransferOperationPlan(transferPlan);

        expect(operationPlan.cleanupPolicy).toBe('attempt-after-main');
        expect(operationPlan.steps.map(step => step.phase)).toEqual(['setup', 'setup', 'main', 'cleanup']);
        expect(operationPlan.steps.map(step => step.label)).toEqual([
            'Proof setup 1',
            'Proof setup 2',
            'Private transfer',
            'Proof cleanup',
        ]);
        expect(operationPlan.steps[2]!.transaction).toBe(transaction);
    });

    it('uses granular cleanup transactions when a transfer plan provides them', async () => {
        const authority = await generateKeyPairSigner();
        const source = await generateKeyPairSigner();
        const transaction = await createHarvestConfidentialTransferFeesTransaction({
            rpc,
            mint,
            sources: [source.address],
            feePayer: authority,
        });
        const transferPlan: ConfidentialTransferPlan = {
            sourceTokenAccount: tokenAccount,
            destinationTokenAccount: source.address,
            contextStateAccounts: {
                equality: source.address,
                ciphertextValidity: source.address,
                range: source.address,
            },
            setupTransactions: [transaction, transaction],
            transferTransaction: transaction,
            cleanupTransactions: [transaction, transaction, transaction],
            cleanupTransaction: transaction,
        };

        const operationPlan = createConfidentialTransferOperationPlan(transferPlan);

        expect(operationPlan.steps.map(step => step.phase)).toEqual([
            'setup',
            'setup',
            'main',
            'cleanup',
            'cleanup',
            'cleanup',
        ]);
        expect(operationPlan.steps.slice(3).map(step => step.label)).toEqual([
            'Proof cleanup 1',
            'Proof cleanup 2',
            'Proof cleanup 3',
        ]);
    });

    it('executes operation plans through the shared setup/main/cleanup policy', async () => {
        const authority = await generateKeyPairSigner();
        const source = await generateKeyPairSigner();
        const transaction = await createHarvestConfidentialTransferFeesTransaction({
            rpc,
            mint,
            sources: [source.address],
            feePayer: authority,
        });
        const transferPlan: ConfidentialTransferPlan = {
            sourceTokenAccount: tokenAccount,
            destinationTokenAccount: source.address,
            contextStateAccounts: {
                equality: source.address,
                ciphertextValidity: source.address,
                range: source.address,
            },
            setupTransactions: [transaction],
            transferTransaction: transaction,
            cleanupTransactions: [transaction],
            cleanupTransaction: transaction,
        };
        const progress: string[] = [];

        const result = await executeConfidentialOperationPlan({
            plan: createConfidentialTransferOperationPlan(transferPlan),
            signTransaction: async (_transaction, executionStep) => executionStep.step.label,
            sendTransaction: async () => {},
            getSignature: signedTransaction => signedTransaction,
            onProgress: item => progress.push(`${item.status}:${item.label}`),
        });

        expect(result.signatures).toEqual(['Proof setup 1', 'Private transfer', 'Proof cleanup']);
        expect(progress).toContain('signing:Proof setup 1');
        expect(progress).toContain('confirmed:Proof cleanup');
    });

    it('refreshes planned transaction blockhashes before execution', async () => {
        const authority = await generateKeyPairSigner();
        const transaction = await createHarvestConfidentialTransferFeesTransaction({
            rpc,
            mint,
            sources: [tokenAccount],
            feePayer: authority,
        });
        const latestBlockhash = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';
        const freshRpc = {
            ...rpc,
            getLatestBlockhash: () => ({
                send: async () => ({
                    context: {
                        slot: 1n,
                    },
                    value: {
                        blockhash: latestBlockhash,
                        lastValidBlockHeight: 12345679n,
                    },
                }),
            }),
        } as unknown as Rpc<SolanaRpcApi>;

        const refreshed = await refreshTransactionBlockhash(freshRpc, transaction);

        expect(refreshed.lifetimeConstraint.blockhash).toBe(latestBlockhash);
        expect(transaction.lifetimeConstraint.blockhash).not.toBe(latestBlockhash);
    });

    it('creates an account snapshot with lifecycle, key-derivation state, and available actions', () => {
        const snapshot = createConfidentialTransferAccountSnapshot({
            status: {
                tokenAccount,
                exists: true,
                configured: true,
                publicBalance: 0n,
                approved: false,
                elgamalPubkey: null,
                allowConfidentialCredits: true,
                allowNonConfidentialCredits: true,
                pendingBalanceCreditCounter: 0n,
                maximumPendingBalanceCreditCounter: 65536n,
            },
        });

        expect(snapshot.lifecycle).toBe('configured');
        expect(snapshot.keyDerivation).toEqual({
            messageSigningRequired: true,
            messageSigningAvailable: false,
            canReadEncryptedBalances: false,
        });
        expect(snapshot.availableActions).toMatchObject({
            configureAccount: false,
            approveAccount: true,
            deposit: false,
            transfer: false,
            setConfidentialCredits: true,
        });
        expect(snapshot.creditSettings.allowConfidentialCredits).toBe(true);
    });

    it('reports current confidential transfer fee capability from one place', () => {
        const capability = getConfidentialTransferFeeCapability();

        expect(capability.harvestWithheldFeesToMint.supported).toBe(true);
        expect(capability.transferWithFee.supported).toBe(false);
        expect(capability.transferWithFee.reason).toContain('Pedersen opening arithmetic');
        expect(capability.withdrawWithheldFeesFromMint.reason).toContain('withdraw-withheld ElGamal key');
        expect(capability.withdrawWithheldFeesFromAccounts.reason).toContain('aggregate withheld-fee equality proof');
    });
});

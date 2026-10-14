import setupTestSuite from './setup.js';
import type { Client } from './setup.js';
import type { KeyPairSigner, Signature, TransactionSigner } from '@solana/kit';
import { generateKeyPairSigner, getBase64Encoder } from '@solana/kit';
import { getMintSize, type Extension } from '@solana-program/token-2022';
import {
    sendAndConfirmTransaction,
    waitForEpochAtLeast,
    getConfirmationBlockTime,
    DEFAULT_TIMEOUT,
    DEFAULT_COMMITMENT,
} from './helpers.js';
import { Token } from '../../issuance/index.js';
import { createCustomTokenInitTransaction } from '../../templates/index.js';
import { inspectToken } from '../../inspection/index.js';
import type { FullTransaction } from '../../transaction-util.js';

// How far the rate-bearing timestamps may drift from the confirming block's time
const CLOCK_TOLERANCE_SECONDS = 30n;

/**
 * Checks that the rate fields on a live mint are what was requested, and that the fields
 * Token-2022 fills in itself (transfer fee epoch, interest timestamps) come from the cluster,
 * not from the client-side placeholders the `Token` builder carries (HOO-1684).
 *
 * The epoch checks need the cluster past epoch 0, where the real epoch would look the same as
 * the `0n` placeholder. `test-with-validator.js` starts the validator with 32-slot epochs, and
 * `beforeAll` waits for epoch 1.
 */
describe('Rate extension integration tests', () => {
    let client: Client;
    let mintAuthority: TransactionSigner<string>;
    let payer: TransactionSigner<string>;
    let mint: KeyPairSigner<string>;

    beforeAll(async () => {
        const testSuite = await setupTestSuite();
        client = testSuite.client;
        mintAuthority = testSuite.mintAuthority;
        payer = testSuite.payer;

        await waitForEpochAtLeast(client.rpc, 1);
    }, DEFAULT_TIMEOUT);

    beforeEach(async () => {
        mint = await generateKeyPairSigner();
    });

    const currentEpoch = async (): Promise<bigint> =>
        (await client.rpc.getEpochInfo({ commitment: DEFAULT_COMMITMENT }).send()).epoch;

    /** Sends `tx` and returns its signature with the cluster epoch just before and after. */
    const sendBetweenEpochs = async (tx: FullTransaction) => {
        const epochBefore = await currentEpoch();
        const signature = await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);
        const epochAfter = await currentEpoch();
        return { signature, epochBefore, epochAfter };
    };

    const expectNearBlockTime = async (signature: Signature, timestamp: bigint) => {
        const blockTime = await getConfirmationBlockTime(client.rpc, signature);
        const drift = timestamp > blockTime ? timestamp - blockTime : blockTime - timestamp;
        expect(drift).toBeLessThanOrEqual(CLOCK_TOLERANCE_SECONDS);
    };

    const expectEpochWithin = (epoch: bigint, before: bigint, after: bigint) => {
        expect(epoch).toBeGreaterThanOrEqual(1n);
        expect(epoch).toBeGreaterThanOrEqual(before);
        expect(epoch).toBeLessThanOrEqual(after);
    };

    const customToken = (options: Parameters<typeof createCustomTokenInitTransaction>[8]) =>
        createCustomTokenInitTransaction(
            client.rpc,
            'Rate Token',
            'RATE',
            6,
            'https://example.com/rate.json',
            mintAuthority,
            mint,
            payer,
            options,
        );

    it(
        'transfer fee lands as requested, stamped with the cluster epoch',
        async () => {
            const tx = await customToken({
                enableTransferFee: true,
                transferFeeBasisPoints: 250,
                transferFeeMaximum: 1_000_000n,
            });
            const { epochBefore, epochAfter } = await sendBetweenEpochs(tx);

            const { transferFee } = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
            expect(transferFee).toMatchObject({
                transferFeeBasisPoints: 250,
                maximumFee: 1_000_000n,
                withheldAmount: 0n,
                authority: mintAuthority.address,
                withdrawAuthority: mintAuthority.address,
                newerTransferFee: { transferFeeBasisPoints: 250, maximumFee: 1_000_000n },
                olderTransferFee: { transferFeeBasisPoints: 250, maximumFee: 1_000_000n },
            });
            expectEpochWithin(transferFee!.newerTransferFee.epoch, epochBefore, epochAfter);
            expectEpochWithin(transferFee!.olderTransferFee.epoch, epochBefore, epochAfter);
            // inspectToken reads the epoch after creation, so the configured fee is already the active one
            expect(transferFee!.currentEpoch).toBeGreaterThanOrEqual(transferFee!.newerTransferFee.epoch);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'interest-bearing rate lands as requested, stamped with the cluster clock',
        async () => {
            const tx = await customToken({ enableInterestBearing: true, interestRate: 500 });
            const signature = await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

            const { interestBearing } = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
            expect(interestBearing).toMatchObject({
                currentRate: 500,
                preUpdateAverageRate: 500,
                rateAuthority: mintAuthority.address,
            });
            expect(interestBearing!.initializationTimestamp).toBe(interestBearing!.lastUpdateTimestamp);
            await expectNearBlockTime(signature, interestBearing!.initializationTimestamp);
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'scaled UI amount keeps a scheduled multiplier change (HOO-1711)',
        async () => {
            const effectiveTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const tx = await customToken({
                enableScaledUiAmount: true,
                scaledUiAmountMultiplier: 2,
                scaledUiAmountNewMultiplier: 5,
                scaledUiAmountNewMultiplierEffectiveTimestamp: effectiveTimestamp,
            });
            await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

            const { scaledUiAmount } = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
            expect(scaledUiAmount).toMatchObject({
                enabled: true,
                multiplier: 2,
                newMultiplier: 5,
                newMultiplierEffectiveTimestamp: effectiveTimestamp,
                authority: mintAuthority.address,
            });
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'scaled UI amount without a schedule keeps the initial multiplier and no change',
        async () => {
            const tx = await customToken({ enableScaledUiAmount: true, scaledUiAmountMultiplier: 3 });
            await sendAndConfirmTransaction(client, tx, DEFAULT_COMMITMENT);

            const { scaledUiAmount } = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);
            expect(scaledUiAmount).toMatchObject({
                enabled: true,
                multiplier: 3,
                newMultiplier: 3,
                newMultiplierEffectiveTimestamp: 0n,
            });
        },
        DEFAULT_TIMEOUT,
    );

    it(
        'ignores poisoned client-side placeholders: the cluster fills in epoch, timestamps and withheld amount',
        async () => {
            const build = () =>
                new Token()
                    .withTransferFee({
                        authority: mintAuthority.address,
                        withdrawAuthority: mintAuthority.address,
                        feeBasisPoints: 250,
                        maximumFee: 1_000_000n,
                    })
                    .withInterestBearing({ authority: mintAuthority.address, rate: 500 });

            const expectedSize = getMintSize(build().getExtensions());

            // The HOO-1684 experiment: overwrite every value Token-2022 is supposed to set itself
            const tokenBuilder = build();
            for (const ext of tokenBuilder.getExtensions() as Extension[]) {
                if (ext.__kind === 'TransferFeeConfig') {
                    ext.withheldAmount = 7n;
                    ext.newerTransferFee = { ...ext.newerTransferFee, epoch: 999n };
                    ext.olderTransferFee = { ...ext.olderTransferFee, epoch: 999n };
                } else if (ext.__kind === 'InterestBearingConfig') {
                    ext.initializationTimestamp = 1n;
                    ext.lastUpdateTimestamp = 2n;
                    ext.preUpdateAverageRate = 9999;
                }
            }

            const tx = await tokenBuilder.buildTransaction({
                rpc: client.rpc,
                decimals: 6,
                mintAuthority,
                mint,
                feePayer: payer,
            });
            const { signature, epochBefore, epochAfter } = await sendBetweenEpochs(tx);

            const { transferFee, interestBearing } = await inspectToken(client.rpc, mint.address, DEFAULT_COMMITMENT);

            expect(transferFee).toMatchObject({
                transferFeeBasisPoints: 250,
                maximumFee: 1_000_000n,
                withheldAmount: 0n,
                newerTransferFee: { transferFeeBasisPoints: 250, maximumFee: 1_000_000n },
                olderTransferFee: { transferFeeBasisPoints: 250, maximumFee: 1_000_000n },
            });
            expectEpochWithin(transferFee!.newerTransferFee.epoch, epochBefore, epochAfter);
            expectEpochWithin(transferFee!.olderTransferFee.epoch, epochBefore, epochAfter);

            expect(interestBearing).toMatchObject({ currentRate: 500, preUpdateAverageRate: 500 });
            expect(interestBearing!.initializationTimestamp).toBe(interestBearing!.lastUpdateTimestamp);
            await expectNearBlockTime(signature, interestBearing!.initializationTimestamp);

            // The placeholders don't change the allocated size either
            const accountInfo = await client.rpc
                .getAccountInfo(mint.address, { encoding: 'base64', commitment: DEFAULT_COMMITMENT })
                .send();
            expect(accountInfo.value).not.toBeNull();
            const data = getBase64Encoder().encode(accountInfo.value!.data[0]);
            expect(data.length).toBe(expectedSize);
        },
        DEFAULT_TIMEOUT,
    );
});

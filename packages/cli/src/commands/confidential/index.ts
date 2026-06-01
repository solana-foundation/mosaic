import { Command } from 'commander';
import chalk from 'chalk';
import {
    assertIsTransactionWithBlockhashLifetime,
    createNoopSigner,
    getSignatureFromTransaction,
    sendAndConfirmTransactionFactory,
    signTransactionMessageWithSigners,
    type Address,
    type Commitment,
    type FullySignedTransaction,
    type Transaction,
    type TransactionSigner,
    type TransactionWithinSizeLimit,
    type TransactionWithBlockhashLifetime,
} from '@solana/kit';
import {
    asConfidentialTransferAuthoritySigner,
    assertConfidentialTransferAuthorityMatchesSigner,
    createApplyConfidentialPendingBalanceTransaction,
    createApproveConfidentialTransferAccountTransaction,
    createConfigureConfidentialTransferAccountTransaction,
    createConfidentialDepositTransaction,
    createConfidentialFeeWithdrawOperationPlan,
    createConfidentialTransferPlan,
    createConfidentialTransferOperationPlan,
    createConfidentialTransferWithFeePlan,
    createConfidentialWithdrawTransaction,
    createEmptyConfidentialTransferAccountTransaction,
    createHarvestConfidentialTransferFeesTransaction,
    createSetConfidentialCreditsTransaction,
    createSetNonConfidentialCreditsTransaction,
    createSingleTransactionConfidentialOperationPlan,
    createUpdateConfidentialTransferMintTransaction,
    createWithdrawConfidentialTransferFeesFromAccountsPlan,
    createWithdrawConfidentialTransferFeesFromMintPlan,
    getConfidentialTransferAccountSnapshot,
    type ConfidentialTransferAuthoritySigner,
    type ConfidentialOperationPlan,
    type FullTransaction,
} from '@solana/mosaic-sdk';
import { createSpinner, getGlobalOpts } from '../../utils/cli.js';
import { outputRawTransactions } from '../../utils/raw-tx.js';
import { createRpcClient, createRpcSubscriptions } from '../../utils/rpc.js';
import { getAddressFromKeypair, loadKeypair } from '../../utils/solana.js';

type SendableTx = FullySignedTransaction & Transaction & TransactionWithBlockhashLifetime & TransactionWithinSizeLimit;

type SendAndConfirmFn = (
    transaction: SendableTx,
    config: { commitment: Commitment; skipPreflight?: boolean },
) => Promise<void>;

type TransactionAuthority = {
    authority: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
    owner: Address;
};

type ConfidentialAuthority = {
    authority: ConfidentialTransferAuthoritySigner<string>;
    feePayer: TransactionSigner<string>;
    owner: Address;
};

function asAddress(value: string, name: string): Address {
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value as Address;
}

function getCommandContext(command: Command) {
    const opts = getGlobalOpts(command);
    const rpc = createRpcClient(opts.rpcUrl);
    const rpcSubscriptions = createRpcSubscriptions(opts.rpcUrl);
    return {
        rpc,
        rawTx: opts.rawTx as string | undefined,
        keypair: opts.keypair as string | undefined,
        authorityAddress: opts.authority as string | undefined,
        feePayerAddress: opts.feePayer as string | undefined,
        sendAndConfirmTransaction: sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions }),
    };
}

async function resolveTransactionAuthority(command: Command, owner?: string): Promise<TransactionAuthority> {
    const context = getCommandContext(command);
    if (context.rawTx) {
        const authorityAddress =
            context.authorityAddress ?? (context.keypair ? await getAddressFromKeypair(context.keypair) : undefined);
        if (!authorityAddress) {
            throw new Error('In raw transaction mode, pass --authority or --keypair for the authority address');
        }
        const feePayerAddress = context.feePayerAddress ?? authorityAddress;
        return {
            authority: createNoopSigner(authorityAddress as Address),
            feePayer: createNoopSigner(feePayerAddress as Address),
            owner: (owner as Address | undefined) ?? (authorityAddress as Address),
        };
    }

    const keypair = await loadKeypair(context.keypair);
    return {
        authority: keypair,
        feePayer: keypair,
        owner: (owner as Address | undefined) ?? (keypair.address as Address),
    };
}

async function resolveConfidentialAuthority(command: Command, owner?: string): Promise<ConfidentialAuthority> {
    const context = getCommandContext(command);
    const keypair = await loadKeypair(context.keypair);
    assertConfidentialTransferAuthorityMatchesSigner({
        requestedAuthority: context.authorityAddress,
        signerAddress: keypair.address,
    });
    const feePayer =
        context.rawTx && context.feePayerAddress && context.feePayerAddress !== keypair.address
            ? createNoopSigner(context.feePayerAddress as Address)
            : keypair;
    const authority = asConfidentialTransferAuthoritySigner(keypair);

    return {
        authority,
        feePayer,
        owner: (owner as Address | undefined) ?? (keypair.address as Address),
    };
}

function singleTransactionPlan(label: string, transaction: FullTransaction): ConfidentialOperationPlan {
    return createSingleTransactionConfidentialOperationPlan({ label, transaction });
}

async function executeOperationPlan(input: {
    plan: ConfidentialOperationPlan;
    rawTx?: string;
    sendAndConfirmTransaction: SendAndConfirmFn;
}): Promise<string[]> {
    const steps = input.plan.steps;
    if (input.rawTx) {
        outputRawTransactions(input.rawTx, steps);
        return [];
    }

    const signatures: string[] = [];
    const indexedSteps = steps.map((step, index) => ({ step, index }));
    const cleanupSteps = indexedSteps.filter(({ step }) => step.phase === 'cleanup');

    const executeStep = async ({ step, index }: (typeof indexedSteps)[number]): Promise<string> => {
        console.log(chalk.cyan(`Transaction ${index + 1}/${steps.length}: ${step.label}`));
        const signed = await signTransactionMessageWithSigners(step.transaction);
        assertIsTransactionWithBlockhashLifetime(signed);
        await input.sendAndConfirmTransaction(signed as SendableTx, {
            commitment: 'confirmed',
            skipPreflight: true,
        });
        return getSignatureFromTransaction(signed);
    };

    const runCleanupSteps = async (): Promise<string | undefined> => {
        for (const cleanupStep of cleanupSteps) {
            try {
                signatures.push(await executeStep(cleanupStep));
            } catch (error) {
                return error instanceof Error ? error.message : String(error);
            }
        }
        return undefined;
    };

    for (const indexedStep of indexedSteps) {
        if (indexedStep.step.phase === 'cleanup') {
            continue;
        }

        try {
            signatures.push(await executeStep(indexedStep));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (indexedStep.step.phase === 'main' && input.plan.cleanupPolicy === 'attempt-after-main') {
                const cleanupError = await runCleanupSteps();
                if (cleanupError) {
                    throw new Error(`${message}. Cleanup failed: ${cleanupError}`);
                }
            }
            throw error;
        }
    }

    if (input.plan.cleanupPolicy === 'attempt-after-main') {
        const cleanupError = await runCleanupSteps();
        if (cleanupError) {
            console.warn(chalk.yellow(`Cleanup failed after the main confidential action: ${cleanupError}`));
        }
    }

    return signatures;
}

function parseSources(value: string | string[] | undefined): Address[] {
    if (!value) {
        return [];
    }
    const values = Array.isArray(value) ? value : [value];
    return values
        .flatMap(source => source.split(','))
        .map(source => source.trim())
        .filter(Boolean)
        .map(source => source as Address);
}

function printSignatures(signatures: string[]): void {
    signatures.forEach((signature, index) => {
        console.log(`Transaction ${index + 1}: ${signature}`);
    });
}

function stringifyJson(value: unknown): string {
    return JSON.stringify(
        value,
        (_key, nestedValue) => (typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue),
        2,
    );
}

export const confidentialCommand = new Command('confidential').description(
    'Manage Token-2022 confidential transfer accounts, balances, transfers, and fees',
);

confidentialCommand
    .command('configure-account')
    .description('Configure a token account for confidential transfers')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .option('-o, --owner <address>', 'Token account owner (defaults to local keypair)')
    .option('-t, --token-account <address>', 'Token account to configure')
    .option('--maximum-pending-balance-credit-counter <count>', 'Maximum pending balance credit counter')
    .option('--no-create-associated-token-account', 'Do not create the associated token account')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer, owner } = await resolveConfidentialAuthority(command, options.owner);
        const spinner = createSpinner('Building confidential account configuration...', context.rawTx);
        try {
            const result = await createConfigureConfidentialTransferAccountTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                tokenAccount: options.tokenAccount as Address | undefined,
                maximumPendingBalanceCreditCounter: options.maximumPendingBalanceCreditCounter
                    ? BigInt(options.maximumPendingBalanceCreditCounter)
                    : undefined,
                createAssociatedTokenAccount: options.createAssociatedTokenAccount,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('configure confidential account', result.transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            console.log(chalk.green('Confidential account configuration built'));
            console.log(`Token account: ${result.tokenAccount}`);
            console.log(`ElGamal pubkey: ${result.elgamalPubkey}`);
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to configure confidential account');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('approve-account')
    .description('Approve a configured confidential transfer account')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .requiredOption('-t, --token-account <address>', 'Token account to approve')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer } = await resolveTransactionAuthority(command);
        const spinner = createSpinner('Building confidential account approval...', context.rawTx);
        try {
            const transaction = await createApproveConfidentialTransferAccountTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                tokenAccount: asAddress(options.tokenAccount, 'token account'),
                authority,
                feePayer,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('approve confidential account', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to approve confidential account');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('deposit')
    .description('Deposit public tokens into a confidential balance')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .requiredOption('-a, --amount <amount>', 'Decimal token amount')
    .option('-o, --owner <address>', 'Token account owner (defaults to authority)')
    .option('-t, --token-account <address>', 'Token account')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer, owner } = await resolveTransactionAuthority(command, options.owner);
        const spinner = createSpinner('Building confidential deposit...', context.rawTx);
        try {
            const transaction = await createConfidentialDepositTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                amount: options.amount,
                tokenAccount: options.tokenAccount as Address | undefined,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('confidential deposit', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to build confidential deposit');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('apply-pending')
    .description('Apply pending confidential balance into available balance')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .option('-o, --owner <address>', 'Token account owner (defaults to local keypair)')
    .option('-t, --token-account <address>', 'Token account')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer, owner } = await resolveConfidentialAuthority(command, options.owner);
        const spinner = createSpinner('Building apply-pending transaction...', context.rawTx);
        try {
            const transaction = await createApplyConfidentialPendingBalanceTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                tokenAccount: options.tokenAccount as Address | undefined,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('apply pending balance', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to apply pending confidential balance');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('transfer')
    .description('Create a private confidential transfer plan')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .requiredOption('-r, --recipient <address>', 'Recipient wallet or token account address')
    .requiredOption('-a, --amount <amount>', 'Decimal token amount')
    .option('-s, --sender <address>', 'Sender wallet address (defaults to local keypair)')
    .option('--source-token-account <address>', 'Source token account')
    .option('--destination-token-account <address>', 'Destination token account')
    .option('--with-fee', 'Use the confidential transfer-with-fee planner')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer, owner } = await resolveConfidentialAuthority(command, options.sender);
        const spinner = createSpinner('Building confidential transfer plan...', context.rawTx);
        try {
            const commonInput = {
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                from: owner,
                to: asAddress(options.recipient, 'recipient'),
                authority,
                feePayer,
                amount: options.amount,
                sourceTokenAccount: options.sourceTokenAccount as Address | undefined,
                destinationTokenAccount: options.destinationTokenAccount as Address | undefined,
            };
            const plan = options.withFee
                ? await createConfidentialTransferWithFeePlan(commonInput)
                : await createConfidentialTransferPlan(commonInput);
            spinner.stop();
            if ('feeAmount' in plan) {
                console.log(`Fee amount: ${plan.feeAmount}`);
                console.log(`Net amount: ${plan.netAmount}`);
            }
            const signatures = await executeOperationPlan({
                plan: createConfidentialTransferOperationPlan(plan),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to build confidential transfer plan');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('withdraw')
    .description('Withdraw from a confidential balance into public balance')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .requiredOption('-a, --amount <amount>', 'Decimal token amount')
    .option('-o, --owner <address>', 'Token account owner (defaults to local keypair)')
    .option('-t, --token-account <address>', 'Token account')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer, owner } = await resolveConfidentialAuthority(command, options.owner);
        const spinner = createSpinner('Building confidential withdraw...', context.rawTx);
        try {
            const transaction = await createConfidentialWithdrawTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                amount: options.amount,
                tokenAccount: options.tokenAccount as Address | undefined,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('confidential withdraw', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to build confidential withdraw');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('empty-account')
    .description('Empty a zero-balance confidential transfer account')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .option('-o, --owner <address>', 'Token account owner (defaults to local keypair)')
    .option('-t, --token-account <address>', 'Token account')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer, owner } = await resolveConfidentialAuthority(command, options.owner);
        const spinner = createSpinner('Building empty-account transaction...', context.rawTx);
        try {
            const transaction = await createEmptyConfidentialTransferAccountTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                tokenAccount: options.tokenAccount as Address | undefined,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('empty confidential account', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to empty confidential account');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('balances')
    .description('Read public, pending, and available confidential balances')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .option('-o, --owner <address>', 'Token account owner (defaults to local keypair)')
    .option('-t, --token-account <address>', 'Token account')
    .option('--status-only', 'Only read account status; does not require message signing')
    .option('--snapshot', 'Output account lifecycle, credit settings, available actions, and key-derivation state')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const mint = asAddress(options.mint, 'mint');
        const tokenAccount = options.tokenAccount as Address | undefined;
        try {
            if (options.statusOnly || options.snapshot) {
                const { owner } = await resolveTransactionAuthority(command, options.owner);
                const snapshot = await getConfidentialTransferAccountSnapshot({
                    rpc: context.rpc,
                    mint,
                    owner,
                    tokenAccount,
                });
                console.log(stringifyJson(options.statusOnly ? snapshot.status : snapshot));
                return;
            }

            const { authority, owner } = await resolveConfidentialAuthority(command, options.owner);
            const snapshot = await getConfidentialTransferAccountSnapshot({
                rpc: context.rpc,
                mint,
                owner,
                authority,
                tokenAccount,
            });
            console.log(stringifyJson(snapshot.balances));
        } catch (error) {
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('set-confidential-credits')
    .description('Enable or disable confidential credits on a token account')
    .requiredOption('-t, --token-account <address>', 'Token account')
    .option('--disable', 'Disable confidential credits instead of enabling')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer } = await resolveTransactionAuthority(command);
        const spinner = createSpinner('Building confidential credits update...', context.rawTx);
        try {
            const transaction = await createSetConfidentialCreditsTransaction({
                rpc: context.rpc,
                tokenAccount: asAddress(options.tokenAccount, 'token account'),
                authority,
                feePayer,
                enabled: !options.disable,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('set confidential credits', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to update confidential credits');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('set-non-confidential-credits')
    .description('Enable or disable non-confidential credits on a token account')
    .requiredOption('-t, --token-account <address>', 'Token account')
    .option('--disable', 'Disable non-confidential credits instead of enabling')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer } = await resolveTransactionAuthority(command);
        const spinner = createSpinner('Building non-confidential credits update...', context.rawTx);
        try {
            const transaction = await createSetNonConfidentialCreditsTransaction({
                rpc: context.rpc,
                tokenAccount: asAddress(options.tokenAccount, 'token account'),
                authority,
                feePayer,
                enabled: !options.disable,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('set non-confidential credits', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to update non-confidential credits');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('update-mint')
    .description('Update confidential transfer mint settings')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .option('--auto-approve-new-accounts', 'Auto approve newly configured accounts')
    .option('--auditor-elgamal-pubkey <address>', 'Auditor ElGamal public key')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer } = await resolveTransactionAuthority(command);
        const spinner = createSpinner('Building confidential mint update...', context.rawTx);
        try {
            const transaction = await createUpdateConfidentialTransferMintTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                authority,
                feePayer,
                autoApproveNewAccounts: options.autoApproveNewAccounts ?? false,
                auditorElgamalPubkey: (options.auditorElgamalPubkey as Address | undefined) ?? null,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('update confidential mint', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to update confidential mint');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('harvest-fees')
    .description('Harvest confidential transfer withheld fees from accounts to the mint')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .requiredOption('--source <address...>', 'Source token account(s), or comma-separated accounts')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { feePayer } = await resolveTransactionAuthority(command);
        const spinner = createSpinner('Building confidential fee harvest...', context.rawTx);
        try {
            const transaction = await createHarvestConfidentialTransferFeesTransaction({
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                sources: parseSources(options.source),
                feePayer,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('harvest confidential fees', transaction),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to harvest confidential fees');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

confidentialCommand
    .command('withdraw-fees')
    .description('Withdraw confidential withheld fees from the mint or token accounts')
    .requiredOption('-m, --mint <address>', 'Mint address')
    .requiredOption('-d, --destination-token-account <address>', 'Destination token account')
    .option('--source <address...>', 'Source token account(s), or comma-separated accounts')
    .action(async (options, command) => {
        const context = getCommandContext(command);
        const { authority, feePayer } = await resolveConfidentialAuthority(command);
        const spinner = createSpinner('Building confidential fee withdrawal plan...', context.rawTx);
        try {
            const sources = parseSources(options.source);
            const input = {
                rpc: context.rpc,
                mint: asAddress(options.mint, 'mint'),
                destinationTokenAccount: asAddress(options.destinationTokenAccount, 'destination token account'),
                authority,
                feePayer,
            };
            const plan =
                sources.length > 0
                    ? await createWithdrawConfidentialTransferFeesFromAccountsPlan({ ...input, sources })
                    : await createWithdrawConfidentialTransferFeesFromMintPlan(input);
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: createConfidentialFeeWithdrawOperationPlan(plan),
                rawTx: context.rawTx,
                sendAndConfirmTransaction: context.sendAndConfirmTransaction,
            });
            printSignatures(signatures);
        } catch (error) {
            spinner.fail('Failed to withdraw confidential fees');
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });

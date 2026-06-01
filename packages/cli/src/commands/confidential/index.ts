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
    executeConfidentialOperationPlan,
    getConfidentialTransferFeeCapability,
    getConfidentialTransferAccountSnapshot,
    parseConfidentialTransferAddress,
    parseConfidentialTransferSourceAccounts,
    parseOptionalConfidentialTransferAddress,
    refreshTransactionBlockhash,
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
            authority: createNoopSigner(parseConfidentialTransferAddress(authorityAddress, 'authority')),
            feePayer: createNoopSigner(parseConfidentialTransferAddress(feePayerAddress, 'fee payer')),
            owner:
                parseOptionalConfidentialTransferAddress(owner, 'owner') ??
                parseConfidentialTransferAddress(authorityAddress, 'authority'),
        };
    }

    const keypair = await loadKeypair(context.keypair);
    return {
        authority: keypair,
        feePayer: keypair,
        owner: parseOptionalConfidentialTransferAddress(owner, 'owner') ?? keypair.address,
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
            ? createNoopSigner(parseConfidentialTransferAddress(context.feePayerAddress, 'fee payer'))
            : keypair;
    const authority = asConfidentialTransferAuthoritySigner(keypair);

    return {
        authority,
        feePayer,
        owner: parseOptionalConfidentialTransferAddress(owner, 'owner') ?? keypair.address,
    };
}

function singleTransactionPlan(label: string, transaction: FullTransaction): ConfidentialOperationPlan {
    return createSingleTransactionConfidentialOperationPlan({ label, transaction });
}

async function executeOperationPlan(input: {
    plan: ConfidentialOperationPlan;
    rpc: ReturnType<typeof createRpcClient>;
    rawTx?: string;
    sendAndConfirmTransaction: SendAndConfirmFn;
}): Promise<string[]> {
    const steps = input.plan.steps;
    if (input.rawTx) {
        outputRawTransactions(
            input.rawTx,
            await Promise.all(
                steps.map(async step => ({
                    label: step.label,
                    transaction: await refreshTransactionBlockhash(input.rpc, step.transaction),
                })),
            ),
        );
        return [];
    }

    const result = await executeConfidentialOperationPlan({
        plan: input.plan,
        prepareTransaction: transaction => refreshTransactionBlockhash(input.rpc, transaction),
        signTransaction: async transaction => {
            const signed = await signTransactionMessageWithSigners(transaction);
            assertIsTransactionWithBlockhashLifetime(signed);
            return signed as SendableTx;
        },
        sendTransaction: async signedTransaction => {
            await input.sendAndConfirmTransaction(signedTransaction, {
                commitment: 'confirmed',
                skipPreflight: true,
            });
        },
        getSignature: signedTransaction => getSignatureFromTransaction(signedTransaction),
        onProgress: progress => {
            if (progress.status === 'signing') {
                console.log(chalk.cyan(`Transaction ${progress.index}/${progress.total}: ${progress.label}`));
            }
        },
    });

    if (result.cleanupError) {
        console.warn(chalk.yellow(`Cleanup failed after the main confidential action: ${result.cleanupError}`));
    }

    return result.signatures;
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                tokenAccount: parseOptionalConfidentialTransferAddress(options.tokenAccount, 'token account'),
                maximumPendingBalanceCreditCounter: options.maximumPendingBalanceCreditCounter
                    ? BigInt(options.maximumPendingBalanceCreditCounter)
                    : undefined,
                createAssociatedTokenAccount: options.createAssociatedTokenAccount,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('configure confidential account', result.transaction),
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                tokenAccount: parseConfidentialTransferAddress(options.tokenAccount, 'token account'),
                authority,
                feePayer,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('approve confidential account', transaction),
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                amount: options.amount,
                tokenAccount: parseOptionalConfidentialTransferAddress(options.tokenAccount, 'token account'),
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('confidential deposit', transaction),
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                tokenAccount: parseOptionalConfidentialTransferAddress(options.tokenAccount, 'token account'),
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('apply pending balance', transaction),
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                from: owner,
                to: parseConfidentialTransferAddress(options.recipient, 'recipient'),
                authority,
                feePayer,
                amount: options.amount,
                sourceTokenAccount: parseOptionalConfidentialTransferAddress(
                    options.sourceTokenAccount,
                    'source token account',
                ),
                destinationTokenAccount: parseOptionalConfidentialTransferAddress(
                    options.destinationTokenAccount,
                    'destination token account',
                ),
            };
            const feeCapability = getConfidentialTransferFeeCapability();
            if (options.withFee && !feeCapability.transferWithFee.supported) {
                throw new Error(feeCapability.transferWithFee.reason);
            }
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
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                amount: options.amount,
                tokenAccount: parseOptionalConfidentialTransferAddress(options.tokenAccount, 'token account'),
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('confidential withdraw', transaction),
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                owner,
                authority,
                feePayer,
                tokenAccount: parseOptionalConfidentialTransferAddress(options.tokenAccount, 'token account'),
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('empty confidential account', transaction),
                rpc: context.rpc,
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
        const mint = parseConfidentialTransferAddress(options.mint, 'mint');
        const tokenAccount = parseOptionalConfidentialTransferAddress(options.tokenAccount, 'token account');
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
                tokenAccount: parseConfidentialTransferAddress(options.tokenAccount, 'token account'),
                authority,
                feePayer,
                enabled: !options.disable,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('set confidential credits', transaction),
                rpc: context.rpc,
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
                tokenAccount: parseConfidentialTransferAddress(options.tokenAccount, 'token account'),
                authority,
                feePayer,
                enabled: !options.disable,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('set non-confidential credits', transaction),
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                authority,
                feePayer,
                autoApproveNewAccounts: options.autoApproveNewAccounts ?? false,
                auditorElgamalPubkey:
                    parseOptionalConfidentialTransferAddress(options.auditorElgamalPubkey, 'auditor ElGamal pubkey') ??
                    null,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('update confidential mint', transaction),
                rpc: context.rpc,
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
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                sources: parseConfidentialTransferSourceAccounts(options.source, {
                    required: true,
                    name: 'source token account',
                }),
                feePayer,
            });
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: singleTransactionPlan('harvest confidential fees', transaction),
                rpc: context.rpc,
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
            const sources = parseConfidentialTransferSourceAccounts(options.source, {
                name: 'source token account',
            });
            const input = {
                rpc: context.rpc,
                mint: parseConfidentialTransferAddress(options.mint, 'mint'),
                destinationTokenAccount: parseConfidentialTransferAddress(
                    options.destinationTokenAccount,
                    'destination token account',
                ),
                authority,
                feePayer,
            };
            const feeCapability = getConfidentialTransferFeeCapability();
            if (sources.length > 0 && !feeCapability.withdrawWithheldFeesFromAccounts.supported) {
                throw new Error(feeCapability.withdrawWithheldFeesFromAccounts.reason);
            }
            if (sources.length === 0 && !feeCapability.withdrawWithheldFeesFromMint.supported) {
                throw new Error(feeCapability.withdrawWithheldFeesFromMint.reason);
            }
            const plan =
                sources.length > 0
                    ? await createWithdrawConfidentialTransferFeesFromAccountsPlan({ ...input, sources })
                    : await createWithdrawConfidentialTransferFeesFromMintPlan(input);
            spinner.stop();
            const signatures = await executeOperationPlan({
                plan: createConfidentialFeeWithdrawOperationPlan(plan),
                rpc: context.rpc,
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

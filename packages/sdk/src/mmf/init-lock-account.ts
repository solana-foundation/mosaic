import {
    type Address,
    type Instruction,
    type Rpc,
    type SolanaRpcApi,
    type TransactionSigner,
    appendTransactionMessageInstructions,
    createTransactionMessage,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { getCreateAccountWithSeedInstruction } from '@solana-program/system';
import {
    AuthorityType,
    TOKEN_2022_PROGRAM_ADDRESS,
    getInitializeAccount3Instruction,
    getSetAuthorityInstruction,
    getTokenSize,
} from '@solana-program/token-2022';
import type { FullTransaction } from '../transaction-util';
import { deriveLockAccountAddress, type LockType } from './lock-address';

export interface InitLockAccountInput {
    lockType: LockType;
    mint: Address;
    holder: Address;
    permanentDelegate: TransactionSigner<string>;
    feePayer: TransactionSigner<string>;
}

export interface InitLockAccountResult {
    transaction: FullTransaction;
    lockAccount: Address;
    seed: string;
}

/**
 * Builds a transaction that creates and initializes an MMF lock token account.
 *
 * Address: sha256(permanentDelegate || seed || TOKEN_2022), deterministic from
 * (permanentDelegate, mint, holder, lockType). Solana account owner is Token-2022.
 *
 * Instruction sequence (all signed by permanent delegate + fee payer):
 *   1. CreateAccountWithSeed (fee payer pays rent, PD is base)
 *   2. InitializeAccount3 with owner = permanent delegate
 *   3. SetAuthority(CloseAccount, PD -> PD)   pin close authority before flipping owner
 *   4. SetAuthority(AccountOwner, PD -> holder)
 *
 * End state: SPL owner = holder, close authority = permanent delegate, no holder signature.
 * The mint's DefaultAccountState (Frozen) means the new account starts frozen automatically.
 */
export const createInitLockAccountTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: InitLockAccountInput,
): Promise<InitLockAccountResult> => {
    const { lockType, mint, holder, permanentDelegate, feePayer } = input;

    const { address: lockAccount, seed } = await deriveLockAccountAddress({
        lockType,
        permanentDelegate: permanentDelegate.address,
        mint,
        holder,
    });

    const space = BigInt(getTokenSize());
    const rent = await rpc.getMinimumBalanceForRentExemption(space).send();

    const instructions: Instruction[] = [
        getCreateAccountWithSeedInstruction({
            payer: feePayer,
            newAccount: lockAccount,
            baseAccount: permanentDelegate,
            base: permanentDelegate.address,
            seed,
            amount: rent,
            space,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        getInitializeAccount3Instruction(
            {
                account: lockAccount,
                mint,
                owner: permanentDelegate.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        getSetAuthorityInstruction(
            {
                owned: lockAccount,
                owner: permanentDelegate,
                authorityType: AuthorityType.CloseAccount,
                newAuthority: permanentDelegate.address,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
        getSetAuthorityInstruction(
            {
                owned: lockAccount,
                owner: permanentDelegate,
                authorityType: AuthorityType.AccountOwner,
                newAuthority: holder,
            },
            { programAddress: TOKEN_2022_PROGRAM_ADDRESS },
        ),
    ];

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const transaction = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    ) as FullTransaction;

    return { transaction, lockAccount, seed };
};

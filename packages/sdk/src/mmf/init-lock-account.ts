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
    extension,
    getFreezeAccountInstruction,
    getInitializeAccount3Instruction,
    getSetAuthorityInstruction,
    getThawAccountInstruction,
    getTokenSize,
    type ExtensionArgs,
} from '@solana-program/token-2022';
import { getMintDetails } from '../transaction-util';
import type { FullTransaction } from '../transaction-util';
import { deriveLockAccountAddress, type LockType } from './lock-address';

export interface InitLockAccountInput {
    lockType: LockType;
    mint: Address;
    holder: Address;
    permanentDelegate: TransactionSigner<string>;
    freezeAuthority: TransactionSigner<string>;
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
 * Instruction sequence (signed by permanent delegate + freeze authority + fee payer):
 *   1. CreateAccountWithSeed (fee payer pays rent, PD is base)
 *   2. InitializeAccount3 with owner = permanent delegate (auto-frozen via DefaultAccountState)
 *   3. ThawAccount (freeze authority signs) so SetAuthority is allowed
 *   4. SetAuthority(CloseAccount, PD -> PD) - pin close authority before flipping owner
 *   5. SetAuthority(AccountOwner, PD -> holder)
 *   6. FreezeAccount - return to canonical frozen-by-default state
 *
 * End state: SPL owner = holder, close authority = permanent delegate, frozen, no holder
 * signature required.
 */
export const createInitLockAccountTransaction = async (
    rpc: Rpc<SolanaRpcApi>,
    input: InitLockAccountInput,
): Promise<InitLockAccountResult> => {
    const { lockType, mint, holder, permanentDelegate, freezeAuthority, feePayer } = input;

    const { address: lockAccount, seed } = await deriveLockAccountAddress({
        lockType,
        permanentDelegate: permanentDelegate.address,
        mint,
        holder,
    });

    // Derive required token-account extensions from the mint's extensions. Token-2022 maps
    // certain mint extensions to required account-side counterparts: TransferHook ->
    // TransferHookAccount, PausableConfig -> PausableAccount. InitializeAccount3 fails with
    // InvalidAccountData if the account doesn't have space for them.
    const { extensions: mintExtensions } = await getMintDetails(rpc, mint);
    const tokenAccountExtensions: ExtensionArgs[] = [];
    for (const ext of mintExtensions) {
        if (ext.extension === 'transferHook') {
            tokenAccountExtensions.push(extension('TransferHookAccount', { transferring: false }));
        } else if (ext.extension === 'pausableConfig') {
            // Built as a literal because the codama-generated `extension('PausableAccount')`
            // overload is shadowed by the `extension('Uninitialized')` overload during TS
            // overload resolution (both are zero-data variants with the same arity).
            tokenAccountExtensions.push({ __kind: 'PausableAccount' });
        }
    }
    const space = BigInt(getTokenSize(tokenAccountExtensions));
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
        getThawAccountInstruction(
            { account: lockAccount, mint, owner: freezeAuthority },
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
        getFreezeAccountInstruction(
            { account: lockAccount, mint, owner: freezeAuthority },
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

import type {
    TransactionMessage,
    TransactionMessageWithFeePayer,
    TransactionMessageWithBlockhashLifetime,
} from '@solana/kit';

// Type alias for convenience - represents a complete transaction message ready to be compiled
export type FullTransaction<
    TFeePayer extends TransactionMessageWithFeePayer = TransactionMessageWithFeePayer,
    TLifetime extends TransactionMessageWithBlockhashLifetime = TransactionMessageWithBlockhashLifetime,
> = TransactionMessage & TFeePayer & TLifetime;

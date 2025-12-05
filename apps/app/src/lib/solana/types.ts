import type {
    TransactionMessage,
    TransactionVersion,
    TransactionMessageWithFeePayer,
    TransactionMessageWithBlockhashLifetime,
} from '@solana/kit';

// Type alias for convenience - represents a complete transaction message ready to be compiled
export type FullTransaction<
    _TVersion extends TransactionVersion = TransactionVersion,
    TFeePayer extends TransactionMessageWithFeePayer = TransactionMessageWithFeePayer,
    TLifetime extends TransactionMessageWithBlockhashLifetime = TransactionMessageWithBlockhashLifetime,
> = TransactionMessage & TFeePayer & TLifetime;

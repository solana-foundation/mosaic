/**
 * Centralized text constants for token management modals.
 * This allows easy editing of messaging without digging through component logic.
 */

export const MODAL_ERRORS = {
    WALLET_NOT_CONNECTED: 'Wallet not connected',
    INVALID_ADDRESS: 'Please enter a valid Solana address',
    INVALID_SOURCE_ADDRESS: 'Please enter a valid source address',
    INVALID_DESTINATION_ADDRESS: 'Please enter a valid destination address',
    INVALID_RECIPIENT_ADDRESS: 'Please enter a valid recipient address',
    INVALID_TOKEN_ACCOUNT: 'Please enter a valid token account address',
    INVALID_AMOUNT: 'Please enter a valid amount',
    AMOUNT_GREATER_THAN_ZERO: 'Please enter an amount greater than zero',
    SAME_ADDRESS: 'Source and destination addresses must be different',
    UNEXPECTED_ERROR: 'An unexpected error occurred',
    AN_ERROR_OCCURRED: 'An error occurred',
} as const;

export const MODAL_BUTTONS = {
    CANCEL: 'Cancel',
    CLOSE: 'Close',
    UNDERSTOOD: 'Understood',
    // Action buttons
    BURN_TOKENS: 'Burn Tokens',
    FORCE_BURN: 'Force Burn',
    MINT_TOKENS: 'Mint Tokens',
    SEND_TOKENS: 'Send Tokens',
    FORCE_TRANSFER: 'Force Transfer',
    FREEZE_ACCOUNT: 'Freeze Account',
    THAW_ACCOUNT: 'Thaw Account',
    CLOSE_ACCOUNT: 'Close Account',
    // Loading states
    BURNING: 'Burning...',
    MINTING: 'Minting...',
    SENDING: 'Sending...',
    PROCESSING: 'Processing...',
    FREEZING: 'Freezing...',
    THAWING: 'Thawing...',
    CLOSING: 'Closing...',
    // Continue labels
    BURN_MORE: 'Burn More',
    MINT_MORE: 'Mint More',
    TRANSFER_MORE: 'Transfer More',
    CONTINUE: 'Continue',
    // Disabled state labels (help user understand why button is disabled)
    CONNECT_WALLET: 'Connect Wallet',
    ENTER_AMOUNT: 'Enter Amount',
    ENTER_ADDRESS: 'Enter Address',
    ENTER_RECIPIENT: 'Enter Recipient',
    ENTER_SOURCE: 'Enter Source',
    ENTER_DESTINATION: 'Enter Destination',
    INVALID_AMOUNT: 'Invalid Amount',
    INVALID_ADDRESS: 'Invalid Address',
} as const;

export const MODAL_WARNINGS = {
    // Titles
    IRREVERSIBLE_TITLE: 'Irreversible Action',
    NOT_AUTHORIZED_TITLE: 'Not Authorized',
    AUTHORITY_REQUIRED_TITLE: 'Authority Required',
    REQUIREMENTS_TITLE: 'Requirements',
    ADMINISTRATOR_ACTION_TITLE: 'Administrator Action',
    IMPORTANT_WHEN_PAUSED_TITLE: 'Important: When paused',
    ACCOUNT_FREEZE_TITLE: 'Account Freeze',
    ACCOUNT_THAW_TITLE: 'Account Thaw',
    // Messages
    BURN_WARNING:
        'Burning tokens permanently removes them from your wallet and reduces the total supply. This action cannot be undone.',
    FORCE_BURN_WARNING:
        'Force burning will permanently destroy tokens from any account. This action cannot be undone. Only use this for compliance or emergency purposes.',
    FORCE_TRANSFER_WARNING:
        "This will force transfer tokens from any account without the owner's permission. Use with caution.",
    FREEZE_INFO:
        'Freezing an account will prevent the owner from transferring tokens. This is different from pausing, which affects all accounts.',
    THAW_INFO:
        'Thawing an account will restore the ability for the owner to transfer tokens. Only the freeze authority can perform this action.',
    MINT_NOT_AUTHORIZED: 'Your connected wallet is not the mint authority. Only the mint authority can create new tokens.',
    PERMANENT_DELEGATE_NOT_AUTHORIZED:
        'Your connected wallet is not the permanent delegate. Only the permanent delegate can force burn tokens.',
    // Close account requirements
    CLOSE_ACCOUNT_ZERO_BALANCE: 'Your token account must have a zero balance',
    CLOSE_ACCOUNT_RENT: 'Closing the account will reclaim ~0.002 SOL in rent',
    CLOSE_ACCOUNT_IRREVERSIBLE: 'This action cannot be undone',
} as const;

export const MODAL_LABELS = {
    // Field labels
    AMOUNT: 'Amount',
    AMOUNT_TO_BURN: 'Amount to Burn',
    RECIPIENT_ADDRESS: 'Recipient Address',
    SOURCE_ADDRESS: 'Source Address',
    DESTINATION_ADDRESS: 'Destination Address',
    BURN_FROM_ADDRESS: 'Burn From Address',
    TOKEN_ACCOUNT_ADDRESS: 'Token Account Address',
    BURN_FROM: 'Burn From',
    FROM: 'From',
    MINT_AUTHORITY: 'Mint Authority',
    FREEZE_AUTHORITY: 'Freeze Authority',
    PERMANENT_DELEGATE_AUTHORITY: 'Permanent Delegate Authority',
    RENT_DESTINATION: 'Rent Destination',
    CUSTOM_DESTINATION: 'Custom Destination',
    MEMO: 'Memo',
    TRANSACTION_SIGNATURE: 'Transaction Signature',
} as const;

export const MODAL_HELP_TEXT = {
    BURN_AMOUNT: (tokenSymbol?: string) => `Number of ${tokenSymbol || 'tokens'} to permanently destroy`,
    MINT_AMOUNT: 'Number of tokens to mint',
    TRANSFER_AMOUNT: (tokenSymbol?: string) => `Number of ${tokenSymbol || 'tokens'} to transfer`,
    FORCE_BURN_AMOUNT: 'Number of tokens to permanently destroy',
    RECIPIENT_HELP: 'The wallet that will receive the tokens',
    SOURCE_HELP: 'The account from which tokens will be transferred',
    DESTINATION_HELP: 'The account to which tokens will be transferred',
    BURN_FROM_HELP: 'The account from which tokens will be burned',
    TOKEN_ACCOUNT_HELP: 'The associated token account to freeze or thaw',
    RENT_DESTINATION_HELP: 'The address that will receive the reclaimed SOL',
    MEMO_HELP: 'Optional message attached to the transaction',
    BURN_FROM_WALLET: 'Tokens will be burned from your connected wallet',
    SEND_FROM_WALLET: 'Tokens will be sent from your connected wallet',
    RENT_TO_WALLET: 'Reclaimed SOL will be sent to your connected wallet',
    CUSTOM_RENT_HELP: 'Send reclaimed rent to a different address',
    MINT_AUTHORITY_HELP: 'Only the mint authority can create new tokens',
    FREEZE_AUTHORITY_HELP: 'Only the freeze authority can freeze or thaw accounts',
    PERMANENT_DELEGATE_HELP: 'Only the permanent delegate can execute force burns',
} as const;

export const MODAL_TITLES = {
    // Standard titles
    BURN_TOKENS: 'Burn Tokens',
    BURN_SUCCESSFUL: 'Burn Successful',
    MINT_TOKENS: 'Mint Tokens',
    MINT_SUCCESSFUL: 'Mint Successful',
    TRANSFER_TOKENS: 'Transfer Tokens',
    TRANSFER_SUCCESSFUL: 'Transfer Successful',
    FORCE_BURN_TOKENS: 'Force Burn Tokens',
    FORCE_BURN_SUCCESSFUL: 'Force Burn Successful',
    FORCE_TRANSFER_TOKENS: 'Force Transfer Tokens',
    FORCE_TRANSFER_SUCCESSFUL: 'Force Transfer Successful',
    FREEZE_ACCOUNT: 'Freeze Account',
    ACCOUNT_FROZEN: 'Account Frozen',
    THAW_ACCOUNT: 'Thaw Account',
    ACCOUNT_THAWED: 'Account Thawed',
    CLOSE_TOKEN_ACCOUNT: 'Close Token Account',
    ACCOUNT_CLOSED: 'Account Closed',
    PAUSE_TOKEN: 'Pause Token',
    UNPAUSE_TOKEN: 'Unpause Token',
} as const;

export const MODAL_DESCRIPTIONS = {
    BURN: (tokenSymbol?: string) => `Permanently destroy ${tokenSymbol || 'tokens'} from your wallet`,
    MINT: 'Create new tokens and send them to any address',
    TRANSFER: (tokenSymbol?: string) => `Send ${tokenSymbol || 'tokens'} from your wallet to another address`,
    FORCE_BURN: 'Permanently destroy tokens from any account',
    FORCE_TRANSFER: 'Transfer tokens from any account without owner permission',
    FREEZE: 'Freeze a token account to prevent transfers',
    THAW: 'Thaw a frozen token account to allow transfers',
    CLOSE_ACCOUNT: (tokenSymbol?: string) => `Close your ${tokenSymbol || 'token'} account and reclaim the rent`,
    PAUSE: 'Temporarily halt all token transfers',
    UNPAUSE: 'Resume all token transfers',
} as const;

export const MODAL_SUCCESS_MESSAGES = {
    TOKENS_BURNED: 'Tokens burned successfully!',
    TOKENS_MINTED: 'Tokens minted successfully!',
    TOKENS_TRANSFERRED: 'Tokens transferred successfully!',
    TRANSFER_SUCCESSFUL: 'Transfer successful!',
    ACCOUNT_FROZEN: (address: string) =>
        `Token account ${address.slice(0, 8)}...${address.slice(-6)} has been frozen`,
    ACCOUNT_THAWED: (address: string) =>
        `Token account ${address.slice(0, 8)}...${address.slice(-6)} has been thawed`,
    ACCOUNT_CLOSED: 'Your token account has been closed and the rent has been reclaimed',
} as const;

// Pause modal specific lists
export const PAUSE_EFFECTS = [
    'No token transfers allowed',
    "Token holders can't send or receive tokens",
    "Mint authority can't mint new tokens",
    "Freeze authority can't freeze or thaw tokens",
    'DeFi protocols may malfunction',
    'Only the pause authority can unpause',
] as const;

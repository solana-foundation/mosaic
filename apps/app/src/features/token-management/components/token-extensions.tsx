'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/features/wallet/hooks/use-connector-signer';
import { TokenDisplay } from '@/types/token';
import { Switch } from '@/components/ui/switch';
import { AmountInput } from '@/components/shared/form/amount-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { useTokenExtensionStore, usePauseState, useScaledUiAmountState } from '@/stores/token-extension-store';

interface TokenExtensionsProps {
    token: TokenDisplay;
}

interface ExtensionConfig {
    displayName: string;
    description: string;
    helpText: string;
    type: 'address' | 'toggle' | 'number' | 'readonly' | 'pausable';
    editable?: boolean;
    getDisplayValue?: (token: TokenDisplay) => string | number | boolean | undefined;
}

// Extension configuration map - maps SDK extension names to display config
const EXTENSION_CONFIG: Record<string, ExtensionConfig> = {
    TokenMetadata: {
        displayName: 'Metadata',
        description: 'Token name, symbol, and metadata stored directly in the mint.',
        helpText:
            'Stores token metadata (name, symbol, URI) directly on-chain. This is immutable after creation unless an update authority is set.',
        type: 'readonly',
    },
    MetadataPointer: {
        displayName: 'Metadata Pointer',
        description: "Points to where the token's name, symbol, and metadata are stored.",
        helpText:
            'Points to where metadata is stored. Can point to the mint itself or an external account. Used to establish canonical metadata location.',
        type: 'address',
        getDisplayValue: token => token.metadataUri,
    },
    PausableConfig: {
        displayName: 'Pausable',
        description: 'Lets an authority pause all token transfers globally.',
        helpText:
            'When paused, all token transfers are halted. Only the pause authority can pause/unpause. Toggle to change the pause state.',
        type: 'pausable', // Special type for interactive pause toggle
        getDisplayValue: () => true,
    },
    DefaultAccountState: {
        displayName: 'Default Account State',
        description: 'Configures default state (Frozen/Initialized) for new accounts.',
        helpText:
            'New token accounts are created in this state (Frozen or Initialized). Cannot be changed after mint creation. Frozen by default enables allowlist mode.',
        type: 'readonly',
        getDisplayValue: () => true,
    },
    ConfidentialTransferMint: {
        displayName: 'Confidential Balances',
        description: 'Enables confidential transfer functionality for privacy.',
        helpText:
            'Enables encrypted token balances and transfers for privacy. Balances are hidden from public view. Requires special handling in wallets and dApps.',
        type: 'readonly',
        getDisplayValue: () => true,
    },
    ScaledUiAmountConfig: {
        displayName: 'Scaled UI Amount',
        description: 'Change how balances appear (cosmetic only)',
        helpText:
            'Multiplier that changes how balances display in UIs. Does not affect actual token amounts. Useful for displaying fractional shares or adjusting decimal precision.',
        type: 'number',
        editable: true,
        getDisplayValue: () => undefined, // Will be fetched separately or shown as placeholder
    },
    PermanentDelegate: {
        displayName: 'Permanent Delegate',
        description: 'A permanent authority with full control over all token accounts.',
        helpText:
            'Grants an address permanent delegate authority over all token accounts. Can transfer or burn tokens from any account. Commonly used for compliance and recovery features.',
        type: 'address',
        getDisplayValue: token => token.permanentDelegateAuthority,
    },
    TransferFeeConfig: {
        displayName: 'Transfer Fee',
        description: 'Assesses a fee on every token transfer.',
        helpText:
            'Automatically deducts a fee from every transfer. Fees accumulate in recipient accounts and can be withdrawn by the withdraw authority. Requires transfer_checked instructions.',
        type: 'readonly',
    },
    InterestBearingConfig: {
        displayName: 'Interest Bearing',
        description: 'Tokens accrue interest over time (cosmetic only).',
        helpText:
            'Tokens continuously accrue interest based on a configured rate. Interest is calculated on-chain but displayed cosmetically - no new tokens are minted.',
        type: 'readonly',
    },
    NonTransferable: {
        displayName: 'Non-Transferable',
        description: 'Tokens cannot be transferred to other accounts (soul-bound).',
        helpText:
            'Tokens are permanently bound to the account they are minted to. Cannot be transferred, but can be burned or the account can be closed. Used for achievements, credentials, or identity tokens.',
        type: 'readonly',
        getDisplayValue: () => true,
    },
    TransferHook: {
        displayName: 'Transfer Hook',
        description: 'Custom program logic executed on every transfer.',
        helpText:
            'Executes custom program logic on every transfer. Used for royalties, additional validation, or custom transfer logic. Requires a deployed program implementing the transfer hook interface.',
        type: 'readonly',
    },
};

function truncateAddress(address: string): string {
    return `${address.slice(0, 8)}... ${address.slice(-7)}`;
}

export function TokenExtensions({ token }: TokenExtensionsProps) {
    const { connected, selectedAccount, cluster } = useConnector();

    if (connected && selectedAccount && cluster) {
        return <ManageTokenExtensionsWithWallet token={token} />;
    }

    return (
        <div className="rounded-2xl border bg-card p-8 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
                <p className="font-medium mb-1">Wallet Required</p>
                <p className="text-sm">Please connect your wallet to manage token extensions.</p>
            </div>
        </div>
    );
}

function ManageTokenExtensionsWithWallet({ token }: { token: TokenDisplay }) {
    const { selectedAccount, cluster } = useConnector();
    const transactionSendingSigner = useConnectorSigner();

    // Scaled UI Amount local state for edit mode
    const [showScaledUiEditor, setShowScaledUiEditor] = useState(false);
    const [newMultiplier, setNewMultiplier] = useState<string>('');

    // Get pause state from centralized store
    const { isPaused, isUpdating: isPauseUpdating, error: pauseError } = usePauseState(token.address);
    const { fetchPauseState, togglePause } = useTokenExtensionStore();

    // Get scaled UI state from centralized store
    const { isUpdating: isScaledUiUpdating, error: scaledUiError } = useScaledUiAmountState(token.address);
    const { updateScaledUiMultiplier, setScaledUiError } = useTokenExtensionStore();

    // Fetch pause state on mount if token has pausable extension
    useEffect(() => {
        if (token.address && token.extensions?.some(ext => ext === 'Pausable' || ext === 'PausableConfig')) {
            fetchPauseState(token.address, cluster?.url || '');
        }
    }, [token.address, token.extensions, cluster?.url, fetchPauseState]);

    // Handle pause toggle using store
    const handlePauseToggle = async () => {
        if (!token.address || !transactionSendingSigner || !selectedAccount) return;

        await togglePause(
            token.address,
            {
                pauseAuthority: token.pausableAuthority,
                feePayer: selectedAccount,
                rpcUrl: cluster?.url || '',
            },
            transactionSendingSigner,
        );
    };

    // Handle scaled UI multiplier update using store
    const handleSaveMultiplier = async () => {
        if (!token.address || !transactionSendingSigner) {
            setScaledUiError(token.address || '', 'Wallet not connected');
            return;
        }

        const trimmedValue = newMultiplier.trim();
        if (!trimmedValue) {
            setScaledUiError(token.address, 'Please enter a multiplier value');
            return;
        }

        const multiplier = parseFloat(trimmedValue);
        if (!Number.isFinite(multiplier) || multiplier <= 0) {
            setScaledUiError(token.address, 'Please enter a valid multiplier greater than 0');
            return;
        }

        const success = await updateScaledUiMultiplier(
            token.address,
            { multiplier, rpcUrl: cluster?.url },
            transactionSendingSigner,
        );

        if (success) {
            setNewMultiplier('');
            setShowScaledUiEditor(false);
        }
    };

    // Get extensions that are present and have config
    const presentExtensions = (token.extensions || [])
        .map(extName => {
            const sdkName = mapDisplayNameToSdkName(extName);
            const config = EXTENSION_CONFIG[sdkName];
            return config ? { sdkName, displayName: extName, config } : null;
        })
        .filter((ext): ext is NonNullable<typeof ext> => ext !== null);

    if (presentExtensions.length === 0) {
        return (
            <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="p-5 pb-4">
                    <h3 className="font-semibold text-foreground text-lg">Token Extensions</h3>
                    <p className="text-sm text-muted-foreground mt-1">Configure token-level settings</p>
                </div>
                <div className="px-5 pb-8 text-center text-muted-foreground">No extensions enabled on this token.</div>
            </div>
        );
    }

    return (
        <div className="rounded-3xl border bg-card overflow-hidden">
            {/* Header */}
            <div className="p-5 pb-4">
                <h3 className="font-semibold text-foreground text-lg">Extensions</h3>
                <p className="text-sm text-muted-foreground mt-1">Configure token-level settings</p>
            </div>

            {/* Extensions List */}
            <div className="p-2">
                <div className="bg-muted/50 border border-border rounded-2xl">
                    <div className="divide-y divide-border">
                        {presentExtensions.map(({ sdkName, config }) => {
                            const value = config.getDisplayValue?.(token);

                            return (
                                <div key={sdkName} className="p-5">
                                    {sdkName === 'ScaledUiAmountConfig' && showScaledUiEditor ? (
                                        // Scaled UI Amount Edit Mode
                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <h4 className="font-semibold text-foreground">
                                                        {config.displayName}
                                                    </h4>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-xs">
                                                            {config.helpText}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-0.5">
                                                    {config.description}
                                                </p>
                                            </div>
                                            <div className="space-y-3">
                                                <AmountInput
                                                    label="Multiplier"
                                                    value={newMultiplier}
                                                    onChange={setNewMultiplier}
                                                    placeholder="0.005"
                                                    disabled={isScaledUiUpdating}
                                                    showValidation={false}
                                                />
                                                {scaledUiError && (
                                                    <Alert variant="destructive">
                                                        <AlertDescription>{scaledUiError}</AlertDescription>
                                                    </Alert>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        className="h-10 px-4 rounded-xl"
                                                        onClick={handleSaveMultiplier}
                                                        disabled={isScaledUiUpdating || !newMultiplier.trim()}
                                                    >
                                                        {isScaledUiUpdating ? 'Saving...' : 'Save'}
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="h-10 px-4 rounded-xl"
                                                        onClick={() => {
                                                            setShowScaledUiEditor(false);
                                                            setNewMultiplier('');
                                                            if (token.address) {
                                                                setScaledUiError(token.address, null);
                                                            }
                                                        }}
                                                        disabled={isScaledUiUpdating}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        // View Mode
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <h4 className="font-semibold text-foreground">
                                                        {config.displayName}
                                                    </h4>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-xs">
                                                            {config.helpText}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-0.5">
                                                    {config.description}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {config.type === 'address' && value && typeof value === 'string' && (
                                                    <div className="px-3 py-2 bg-muted rounded-xl font-mono text-sm">
                                                        {truncateAddress(value)}
                                                    </div>
                                                )}
                                                {config.type === 'toggle' && (
                                                    <Switch checked={value === true} disabled />
                                                )}
                                                {config.type === 'pausable' && (
                                                    <div className="flex items-center gap-2">
                                                        {pauseError && (
                                                            <span className="text-xs text-destructive max-w-[200px] truncate">
                                                                {pauseError}
                                                            </span>
                                                        )}
                                                        <Switch
                                                            checked={isPaused}
                                                            disabled={isPauseUpdating}
                                                            onCheckedChange={handlePauseToggle}
                                                        />
                                                    </div>
                                                )}
                                                {config.type === 'number' && (
                                                    <div className="px-3 py-2 bg-muted rounded-xl font-mono text-sm">
                                                        {value || '0.005'}
                                                    </div>
                                                )}
                                                {config.type === 'readonly' && (
                                                    <div className="px-3 py-2 bg-muted rounded-xl text-sm text-muted-foreground">
                                                        Enabled
                                                    </div>
                                                )}
                                                {config.editable && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="h-9 px-4 rounded-xl"
                                                        onClick={() => {
                                                            if (sdkName === 'ScaledUiAmountConfig') {
                                                                setShowScaledUiEditor(true);
                                                            }
                                                        }}
                                                    >
                                                        Edit
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper function to map display names (from creation) to SDK extension names
function mapDisplayNameToSdkName(displayName: string): string {
    const mapping: Record<string, string> = {
        Metadata: 'TokenMetadata',
        'Metadata Pointer': 'MetadataPointer',
        Pausable: 'PausableConfig',
        'Scaled UI Amount': 'ScaledUiAmountConfig',
        'Default Account State': 'DefaultAccountState',
        'Default Account State (Initialized)': 'DefaultAccountState',
        'Default Account State (Frozen)': 'DefaultAccountState',
        'Default Account State (Allowlist)': 'DefaultAccountState',
        'Default Account State (Blocklist)': 'DefaultAccountState',
        'Confidential Balances': 'ConfidentialTransferMint',
        'Permanent Delegate': 'PermanentDelegate',
        'Transfer Fee': 'TransferFeeConfig',
        'Interest Bearing': 'InterestBearingConfig',
        'Non-Transferable': 'NonTransferable',
        'Transfer Hook': 'TransferHook',
    };

    // Check if it's already an SDK name
    if (EXTENSION_CONFIG[displayName]) {
        return displayName;
    }

    // Map display name to SDK name
    return mapping[displayName] || displayName;
}

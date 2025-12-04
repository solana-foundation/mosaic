'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { updateScaledUiMultiplier } from '@/features/token-management/lib/scaled-ui-amount';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/features/wallet/hooks/use-connector-signer';
import { TokenDisplay } from '@/types/token';
import { Switch } from '@/components/ui/switch';
import { AmountInput } from '@/components/shared/form/amount-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface TokenExtensionsProps {
    token: TokenDisplay;
}

interface ExtensionConfig {
    displayName: string;
    description: string;
    helpText: string;
    type: 'address' | 'toggle' | 'number' | 'readonly';
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
            'When paused, all token transfers are halted. Only the pause authority can pause/unpause. Use Admin Actions to toggle pause state.',
        type: 'toggle',
        getDisplayValue: () => true, // Always true if extension exists
    },
    DefaultAccountState: {
        displayName: 'Default Account State',
        description: 'Configures default state (Frozen/Initialized) for new accounts.',
        helpText:
            'New token accounts are created in this state (Frozen or Initialized). Cannot be changed after mint creation. Frozen by default enables allowlist mode.',
        type: 'toggle',
        getDisplayValue: () => true, // Always true if extension exists
    },
    ConfidentialTransferMint: {
        displayName: 'Confidential Balances',
        description: 'Enables confidential transfer functionality for privacy.',
        helpText:
            'Enables encrypted token balances and transfers for privacy. Balances are hidden from public view. Requires special handling in wallets and dApps.',
        type: 'toggle',
        getDisplayValue: () => true, // Always true if extension exists
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
        type: 'toggle',
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
    const [showScaledUiEditor, setShowScaledUiEditor] = useState(false);
    const [newMultiplier, setNewMultiplier] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string>('');

    // Use the connector signer hook which provides a gill-compatible transaction signer
    const transactionSendingSigner = useConnectorSigner();

    // Get extensions that are present and have config
    const presentExtensions = (token.extensions || [])
        .map(extName => {
            // Map common display names to SDK names
            const sdkName = mapDisplayNameToSdkName(extName);
            const config = EXTENSION_CONFIG[sdkName];
            return config ? { sdkName, displayName: extName, config } : null;
        })
        .filter((ext): ext is NonNullable<typeof ext> => ext !== null);

    const handleSaveMultiplier = async () => {
        if (!token.address || !transactionSendingSigner) {
            setError('Wallet not connected');
            return;
        }

        const trimmedValue = newMultiplier.trim();
        if (!trimmedValue) {
            setError('Please enter a multiplier value');
            return;
        }

        const multiplier = parseFloat(trimmedValue);
        if (!Number.isFinite(multiplier) || multiplier <= 0) {
            setError('Please enter a valid multiplier greater than 0');
            return;
        }

        setIsSaving(true);
        setError('');

        try {
            await updateScaledUiMultiplier({ mint: token.address, multiplier }, transactionSendingSigner);
            setNewMultiplier('');
            setShowScaledUiEditor(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update scaled UI multiplier');
        } finally {
            setIsSaving(false);
        }
    };

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
                <div className="bg-muted border border-border rounded-2xl">
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
                                                    disabled={isSaving}
                                                    showValidation={false}
                                                />
                                                {error && (
                                                    <Alert variant="destructive">
                                                        <AlertDescription>{error}</AlertDescription>
                                                    </Alert>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        className="h-10 px-4 rounded-xl"
                                                        onClick={handleSaveMultiplier}
                                                        disabled={isSaving || !newMultiplier.trim()}
                                                    >
                                                        {isSaving ? 'Saving...' : 'Save'}
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="h-10 px-4 rounded-xl"
                                                        onClick={() => {
                                                            setShowScaledUiEditor(false);
                                                            setNewMultiplier('');
                                                            setError('');
                                                        }}
                                                        disabled={isSaving}
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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CustomTokenOptions } from '@/types/token';
import {
    FileText,
    Pause,
    Shield,
    Lock,
    EyeOff,
    Calculator,
    Users,
    Percent,
    TrendingUp,
    Ban,
    Webhook,
    AlertTriangle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CustomTokenExtensionSelectorProps {
    options: CustomTokenOptions;
    onInputChange: (field: string, value: boolean | string) => void;
}

interface ExtensionInfo {
    key: keyof CustomTokenOptions;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    defaultEnabled?: boolean;
}

const extensions: ExtensionInfo[] = [
    {
        key: 'enableMetadata',
        label: 'Metadata',
        description: 'Store token name, symbol, and URI directly on-chain',
        icon: FileText,
        defaultEnabled: true,
    },
    {
        key: 'enablePausable',
        label: 'Pausable',
        description: 'Allow pausing token transfers and other operations',
        icon: Pause,
    },
    {
        key: 'enablePermanentDelegate',
        label: 'Permanent Delegate',
        description: 'Set a permanent delegate with full token control',
        icon: Shield,
    },
    {
        key: 'enableDefaultAccountState',
        label: 'Default Account State',
        description: 'Set default state (initialized/frozen) for new token accounts',
        icon: Lock,
    },
    {
        key: 'enableConfidentialBalances',
        label: 'Confidential Balances',
        description: 'Enable privacy-preserving balance transfers',
        icon: EyeOff,
    },
    {
        key: 'enableScaledUiAmount',
        label: 'Scaled UI Amount',
        description: 'Display token amounts with a custom multiplier',
        icon: Calculator,
    },
    {
        key: 'enableTransferFee',
        label: 'Transfer Fee',
        description: 'Automatically deduct a fee from every token transfer',
        icon: Percent,
    },
    {
        key: 'enableInterestBearing',
        label: 'Interest Bearing',
        description: 'Tokens accrue interest over time (cosmetic display only)',
        icon: TrendingUp,
    },
    {
        key: 'enableNonTransferable',
        label: 'Non-Transferable',
        description: 'Tokens are soul-bound and cannot be transferred',
        icon: Ban,
    },
    {
        key: 'enableTransferHook',
        label: 'Transfer Hook',
        description: 'Execute custom program logic on every transfer',
        icon: Webhook,
    },
    {
        key: 'enableSrfc37',
        label: 'SRFC-37 (Token ACL)',
        description: 'Advanced allowlist/blocklist functionality for transfer controls',
        icon: Users,
    },
];

export function CustomTokenExtensionSelector({ options, onInputChange }: CustomTokenExtensionSelectorProps) {
    const handleToggle = (key: keyof CustomTokenOptions, enabled: boolean) => {
        onInputChange(key as string, enabled);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Token Extensions</CardTitle>
                <CardDescription>Select which Token-2022 extensions to enable for your token</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {extensions.map(extension => {
                    const Icon = extension.icon;
                    const value = options[extension.key];
                    const isEnabled = typeof value === 'boolean' ? value : (extension.defaultEnabled ?? false);

                    return (
                        <div
                            key={extension.key}
                            className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                            <div className="mt-1">
                                <Icon className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <Label htmlFor={extension.key} className="font-semibold cursor-pointer">
                                        {extension.label}
                                    </Label>
                                    <Switch
                                        id={extension.key}
                                        checked={isEnabled}
                                        onCheckedChange={checked => handleToggle(extension.key, checked)}
                                    />
                                </div>
                                <p className="text-sm text-muted-foreground">{extension.description}</p>
                            </div>
                        </div>
                    );
                })}

                {options.enableSrfc37 && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                        <Label className="block text-sm font-medium mb-2">ACL Mode</Label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="aclMode"
                                    value="allowlist"
                                    checked={options.aclMode === 'allowlist'}
                                    onChange={() => onInputChange('aclMode', 'allowlist')}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm">Allowlist</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="aclMode"
                                    value="blocklist"
                                    checked={options.aclMode === 'blocklist' || !options.aclMode}
                                    onChange={() => onInputChange('aclMode', 'blocklist')}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm">Blocklist</span>
                            </label>
                        </div>
                    </div>
                )}

                {/* Transfer Fee Configuration */}
                {options.enableTransferFee && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4">
                        <Label className="block text-sm font-medium">Transfer Fee Configuration</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="transferFeeBasisPoints" className="text-xs text-muted-foreground">
                                    Fee (basis points, 100 = 1%)
                                </Label>
                                <Input
                                    id="transferFeeBasisPoints"
                                    type="number"
                                    min="0"
                                    max="10000"
                                    placeholder="100"
                                    value={options.transferFeeBasisPoints || ''}
                                    onChange={e => onInputChange('transferFeeBasisPoints', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="transferFeeMaximum" className="text-xs text-muted-foreground">
                                    Maximum Fee (in smallest units)
                                </Label>
                                <Input
                                    id="transferFeeMaximum"
                                    type="text"
                                    placeholder="1000000"
                                    value={options.transferFeeMaximum || ''}
                                    onChange={e => onInputChange('transferFeeMaximum', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Interest Bearing Configuration */}
                {options.enableInterestBearing && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4">
                        <Label className="block text-sm font-medium">Interest Bearing Configuration</Label>
                        <div>
                            <Label htmlFor="interestRate" className="text-xs text-muted-foreground">
                                Interest Rate (basis points, 500 = 5% annual)
                            </Label>
                            <Input
                                id="interestRate"
                                type="number"
                                min="0"
                                placeholder="500"
                                value={options.interestRate || ''}
                                onChange={e => onInputChange('interestRate', e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {/* Non-Transferable Warning */}
                {options.enableNonTransferable && (
                    <Alert className="mt-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            Non-transferable tokens are permanently bound to the account they are minted to. They cannot
                            be transferred to other accounts (soul-bound).
                        </AlertDescription>
                    </Alert>
                )}

                {/* Transfer Hook Configuration */}
                {options.enableTransferHook && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4">
                        <Label className="block text-sm font-medium">Transfer Hook Configuration</Label>
                        <div>
                            <Label htmlFor="transferHookProgramId" className="text-xs text-muted-foreground">
                                Hook Program ID (required)
                            </Label>
                            <Input
                                id="transferHookProgramId"
                                type="text"
                                placeholder="Program address..."
                                value={options.transferHookProgramId || ''}
                                onChange={e => onInputChange('transferHookProgramId', e.target.value)}
                            />
                        </div>
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                                Transfer hooks require a deployed program that implements the transfer hook interface.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                {/* Conflict Warning: NonTransferable + TransferFee */}
                {options.enableNonTransferable && options.enableTransferFee && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            Non-transferable tokens cannot have transfer fees since no transfers occur. Please disable
                            one of these extensions.
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}

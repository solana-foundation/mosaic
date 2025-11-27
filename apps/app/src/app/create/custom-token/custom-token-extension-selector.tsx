import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CustomTokenOptions } from '@/types/token';
import { 
    FileText, 
    Pause, 
    Shield, 
    Lock, 
    EyeOff, 
    Calculator,
    Users
} from 'lucide-react';

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
                {extensions.map((extension) => {
                    const Icon = extension.icon;
                    const isEnabled = options[extension.key] ?? extension.defaultEnabled ?? false;
                    
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
                                        onCheckedChange={(checked) => handleToggle(extension.key, checked)}
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
            </CardContent>
        </Card>
    );
}








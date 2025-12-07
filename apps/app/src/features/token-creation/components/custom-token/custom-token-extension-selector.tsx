'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    ChevronDown,
    X,
    Info,
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

// Define extension conflicts: key -> array of conflicting extension keys
const extensionConflicts: Record<string, string[]> = {
    enableNonTransferable: ['enableTransferFee', 'enableTransferHook'],
    enableTransferFee: ['enableNonTransferable'],
    enableTransferHook: ['enableNonTransferable'],
};

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

// Helper to check if an extension has conflicts with currently enabled extensions
function getConflictingExtensions(options: CustomTokenOptions): Set<string> {
    const conflicting = new Set<string>();

    for (const [extKey, conflicts] of Object.entries(extensionConflicts)) {
        const isEnabled = options[extKey as keyof CustomTokenOptions];
        if (isEnabled) {
            for (const conflictKey of conflicts) {
                const conflictEnabled = options[conflictKey as keyof CustomTokenOptions];
                if (conflictEnabled) {
                    conflicting.add(extKey);
                    conflicting.add(conflictKey);
                }
            }
        }
    }

    return conflicting;
}

// Export for use in form validation
export function hasExtensionConflicts(options: CustomTokenOptions): boolean {
    return getConflictingExtensions(options).size > 0;
}

// Check if any selected extensions require additional configuration
export function hasExtensionsRequiringConfig(options: CustomTokenOptions): boolean {
    return !!(
        options.enableTransferFee ||
        options.enableInterestBearing ||
        options.enableTransferHook ||
        options.enableSrfc37 ||
        options.enableScaledUiAmount
    );
}

export function CustomTokenExtensionSelector({ options, onInputChange }: CustomTokenExtensionSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleToggle = (key: keyof CustomTokenOptions, enabled: boolean) => {
        onInputChange(key as string, enabled);
    };

    const isExtensionEnabled = (extension: ExtensionInfo) => {
        const value = options[extension.key];
        return typeof value === 'boolean' ? value : (extension.defaultEnabled ?? false);
    };

    const selectedExtensions = extensions.filter(ext => isExtensionEnabled(ext));
    const selectedCount = selectedExtensions.length;
    const conflictingExtensions = getConflictingExtensions(options);
    const hasConflicts = conflictingExtensions.size > 0;

    return (
        <Card className="">
            <CardHeader className="sr-only">
                <CardTitle>Token Extensions</CardTitle>
                <CardDescription>Select which Token-2022 extensions to enable for your token</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-2">
                {/* Multi-select dropdown */}
                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between h-auto min-h-10 py-2">
                            <span className="text-muted-foreground">
                                {selectedCount === 0
                                    ? 'Select extensions...'
                                    : `${selectedCount} extension${selectedCount !== 1 ? 's' : ''} selected`}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 bg-background dark:bg-zinc-900 border-border"
                        align="start"
                    >
                        <div className="overflow-y-auto p-2" style={{ maxHeight: 'min(450px, 50vh)' }}>
                            {extensions.map(extension => {
                                const Icon = extension.icon;
                                const isEnabled = isExtensionEnabled(extension);
                                const isConflicting = conflictingExtensions.has(extension.key);

                                return (
                                    <div
                                        key={extension.key}
                                        className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted cursor-pointer text-foreground"
                                        onClick={() => handleToggle(extension.key, !isEnabled)}
                                    >
                                        <Checkbox
                                            checked={isEnabled}
                                            onCheckedChange={checked => handleToggle(extension.key, !!checked)}
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <Icon
                                            className={`h-4 w-4 shrink-0 ${isConflicting ? 'text-destructive' : 'text-muted-foreground'}`}
                                        />
                                        <span className={`flex-1 text-sm ${isConflicting ? 'text-destructive' : ''}`}>
                                            {extension.label}
                                        </span>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="p-1 hover:bg-muted rounded"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="max-w-[200px]">
                                                {extension.description}
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
                {/* Selected extensions as badges */}
                {selectedCount > 0 && (
                    <div className="flex flex-wrap gap-2 border-t border-primary/10 pt-2">
                        {selectedExtensions.map(extension => {
                            const isConflicting = conflictingExtensions.has(extension.key);
                            return (
                                <Badge
                                    key={extension.key}
                                    variant={isConflicting ? 'destructive' : 'secondary'}
                                    className="gap-1.5 pr-1 cursor-default"
                                >
                                    {extension.label}
                                    <button
                                        type="button"
                                        className="ml-1 p-0.5 hover:bg-muted-foreground/30 rounded cursor-pointer"
                                        onClick={() => handleToggle(extension.key, false)}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            );
                        })}
                    </div>
                )}

                {/* Single conflict error alert */}
                {hasConflicts && (
                    <Alert variant="warning" className="border-amber-500/50">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            Non-transferable tokens cannot have transfer fees or transfer hooks. Please disable one of
                            the conflicting extensions to continue.
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}

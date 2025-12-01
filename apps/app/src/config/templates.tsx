import { DollarSign, Gamepad2, CandlestickChart, Upload, Settings, type LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';
import type { CapabilityKey, ExtensionKey } from '@/features/token-creation/capabilities/registry';

export interface Template {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    sidebarDescription: ReactNode;
    colorClass: string;
    iconColorClass: string;
    coreCapabilityKeys: CapabilityKey[];
    enabledExtensionKeys: ExtensionKey[];
    standardKeys: CapabilityKey[];
}

export const templates: Template[] = [
    {
        id: 'stablecoin',
        icon: DollarSign,
        title: 'Stablecoin',
        description: 'Create a regulatory-compliant stablecoin with transfer restrictions and metadata management.',
        sidebarDescription: (
            <>
                This stablecoin template is designed for regulatory-compliant issuance with strong controls and safety
                features.
            </>
        ),
        colorClass: 'bg-indigo-100',
        iconColorClass: 'text-indigo-600',
        coreCapabilityKeys: [
            'metadata',
            'accessControls',
            'pausable',
            'permanentDelegate',
            'confidentialBalances',
            'confidentialMintBurn',
        ],
        enabledExtensionKeys: [
            'extMetadata',
            'extPausable',
            'extDefaultAccountStateAllowOrBlock',
            'extConfidentialBalances',
            'extPermanentDelegate',
        ],
        standardKeys: ['sRFC37', 'gatingProgram'],
    },
    {
        id: 'tokenized-security',
        icon: CandlestickChart,
        title: 'Tokenized Security',
        description: 'Create a compliant security token with scaled UI amounts and core controls.',
        sidebarDescription: <>A security token with the stablecoin feature set plus Scaled UI Amount.</>,
        colorClass: 'bg-emerald-100',
        iconColorClass: 'text-emerald-600',
        coreCapabilityKeys: [
            'metadata',
            'accessControls',
            'pausable',
            'permanentDelegate',
            'confidentialBalances',
            'scaledUIAmount',
        ],
        enabledExtensionKeys: [
            'extMetadata',
            'extPausable',
            'extDefaultAccountStateAllowOrBlock',
            'extConfidentialBalances',
            'extPermanentDelegate',
        ],
        standardKeys: ['sRFC37', 'gatingProgram'],
    },
    {
        id: 'arcade-token',
        icon: Gamepad2,
        title: 'Arcade Token',
        description: 'Deploy a gaming or utility token with custom extensions and features.',
        sidebarDescription: (
            <>
                Arcade tokens are closed-loop tokens suitable for in-app or game economies that require an allowlist.
            </>
        ),
        colorClass: 'bg-orange-100',
        iconColorClass: 'text-orange-600',
        coreCapabilityKeys: ['closedLoopAllowlistOnly', 'pausable', 'metadata', 'permanentDelegate'],
        enabledExtensionKeys: [
            'extMetadata',
            'extPausable',
            'extDefaultAccountStateAllow',
            'extPermanentDelegate',
        ],
        standardKeys: ['sRFC37', 'gatingProgram'],
    },
    {
        id: 'custom-token',
        icon: Settings,
        title: 'Custom Token',
        description: 'Build your own token with full control over extensions and parameters.',
        sidebarDescription: (
            <>
                Build your own token with full control over extensions and parameters. Select the extensions and
                capabilities you need.
            </>
        ),
        colorClass: 'bg-violet-100',
        iconColorClass: 'text-violet-600',
        coreCapabilityKeys: [],
        enabledExtensionKeys: [],
        standardKeys: [],
    },
];

export const importTemplate: Template = {
    id: 'import',
    icon: Upload,
    title: 'Import existing token',
    description: 'Import an existing token to manage it through the Mosaic platform.',
    sidebarDescription: <>Import an existing token to manage it through the Mosaic platform.</>,
    colorClass: 'bg-gray-100',
    iconColorClass: 'text-gray-600',
    coreCapabilityKeys: [],
    enabledExtensionKeys: [],
    standardKeys: [],
};

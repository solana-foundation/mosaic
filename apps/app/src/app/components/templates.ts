import { DollarSign, Gamepad2, CandlestickChart, Upload, Settings, type LucideIcon } from 'lucide-react';

export interface Template {
    href: string;
    icon: LucideIcon;
    title: string;
    description: string;
    colorClass: string;
    iconColorClass: string;
}

export const templates: Template[] = [
    {
        href: '/create/stablecoin',
        icon: DollarSign,
        title: 'Stablecoin',
        description: 'Create a regulatory-compliant stablecoin with transfer restrictions and metadata management.',
        colorClass: 'bg-indigo-100',
        iconColorClass: 'text-indigo-600',
    },
    {
        href: '/create/tokenized-security',
        icon: CandlestickChart,
        title: 'Tokenized Security',
        description: 'Create a compliant security token with scaled UI amounts and core controls.',
        colorClass: 'bg-emerald-100',
        iconColorClass: 'text-emerald-600',
    },
    {
        href: '/create/arcade-token',
        icon: Gamepad2,
        title: 'Arcade Token',
        description: 'Deploy a gaming or utility token with custom extensions and features.',
        colorClass: 'bg-orange-100',
        iconColorClass: 'text-orange-600',
    },
    {
        href: '/create/custom-token',
        icon: Settings,
        title: 'Custom Token',
        description: 'Build your own token with full control over extensions and parameters.',
        colorClass: 'bg-violet-100',
        iconColorClass: 'text-violet-600',
    },
];

export const importTemplate: Template = {
    href: '/import',
    icon: Upload,
    title: 'Import existing token',
    description: 'Import an existing token to manage it through the Mosaic platform.',
    colorClass: 'bg-gray-100',
    iconColorClass: 'text-gray-600',
};

import { DollarSign, Gamepad2, CandlestickChart, Upload, type LucideIcon } from 'lucide-react';

export interface Template {
    href: string;
    icon: LucideIcon;
    title: string;
    description: string;
}

export const templates: Template[] = [
    {
        href: '/create/stablecoin',
        icon: DollarSign,
        title: 'Stablecoin',
        description: 'Create a regulatory-compliant stablecoin with transfer restrictions and metadata management.',
    },
    {
        href: '/create/arcade-token',
        icon: Gamepad2,
        title: 'Arcade Token',
        description: 'Deploy a gaming or utility token with custom extensions and features.',
    },
    {
        href: '/create/tokenized-security',
        icon: CandlestickChart,
        title: 'Tokenized Security',
        description: 'Create a compliant security token with scaled UI amounts and core controls.',
    },
    {
        href: '/import',
        icon: Upload,
        title: 'Import Existing Token',
        description: 'Import an existing token to manage it through the Mosaic platform.',
    },
];


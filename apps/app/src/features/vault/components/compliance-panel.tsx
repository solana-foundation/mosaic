'use client';

import { CheckCircle2, XCircle, AlertTriangle, Shield, FileSearch, Globe } from 'lucide-react';

interface ComplianceFeature {
    label: string;
    description: string;
    status: 'active' | 'warning' | 'inactive';
    icon: React.ReactNode;
}

const COMPLIANCE_FEATURES: ComplianceFeature[] = [
    {
        label: 'KYC Gating',
        description: 'DefaultAccountState = Frozen. Accounts unlocked after identity verification.',
        status: 'active',
        icon: <Shield className="h-4 w-4" />,
    },
    {
        label: 'KYT Transfer Hook',
        description: 'Every transfer invokes an on-chain hook that screens against sanctions lists.',
        status: 'active',
        icon: <FileSearch className="h-4 w-4" />,
    },
    {
        label: 'Travel Rule (FATF R.16)',
        description: 'Transfers ≥ threshold attach originator/beneficiary VASP data via SPL Memo.',
        status: 'active',
        icon: <Globe className="h-4 w-4" />,
    },
    {
        label: 'Emergency Pause',
        description: 'Vault authority can halt all transfers instantly.',
        status: 'active',
        icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
        label: 'Permanent Delegate',
        description: 'Regulatory freeze/seize of any account at any time.',
        status: 'active',
        icon: <Shield className="h-4 w-4" />,
    },
];

const STATUS_STYLES: Record<ComplianceFeature['status'], { icon: React.ReactNode; bg: string; text: string }> = {
    active: {
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        bg: 'bg-green-50 dark:bg-green-950/20',
        text: 'text-green-700 dark:text-green-400',
    },
    warning: {
        icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
        bg: 'bg-yellow-50 dark:bg-yellow-950/20',
        text: 'text-yellow-700 dark:text-yellow-400',
    },
    inactive: {
        icon: <XCircle className="h-4 w-4 text-slate-400" />,
        bg: 'bg-slate-50 dark:bg-slate-900/20',
        text: 'text-slate-500',
    },
};

export function CompliancePanel() {
    return (
        <div className="space-y-2">
            {COMPLIANCE_FEATURES.map(feature => {
                const style = STATUS_STYLES[feature.status];
                return (
                    <div key={feature.label} className={`flex items-start gap-3 rounded-lg p-3 ${style.bg}`}>
                        <div className={`mt-0.5 ${style.text}`}>{feature.icon}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{feature.label}</span>
                                {style.icon}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

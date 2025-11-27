import { AlertCircle } from 'lucide-react';

interface WarningBannerProps {
    title: string;
    message: string;
    variant?: 'warning' | 'danger';
}

const variantStyles = {
    warning: {
        containerBase: 'bg-yellow-50',
        borderClass: 'border-yellow-200',
        iconColorClass: 'text-yellow-600',
        messageTextClass: 'text-yellow-800',
    },
    danger: {
        containerBase: 'bg-red-50',
        borderClass: 'border-red-200',
        iconColorClass: 'text-red-600',
        messageTextClass: 'text-red-800',
    },
} as const;

export function WarningBanner({ title, message, variant = 'warning' }: WarningBannerProps) {
    const { containerBase, borderClass, iconColorClass, messageTextClass } = variantStyles[variant];

    return (
        <div className={`p-3 rounded-lg border ${containerBase} ${borderClass}`}>
            <div className="flex gap-2">
                <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconColorClass}`} />
                <div className="text-sm">
                    <p className="font-medium mb-1">{title}</p>
                    <p className={messageTextClass}>{message}</p>
                </div>
            </div>
        </div>
    );
}

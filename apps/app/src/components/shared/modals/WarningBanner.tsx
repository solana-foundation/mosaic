import { AlertCircle } from 'lucide-react';

interface WarningBannerProps {
    title: string;
    message: string;
    variant?: 'warning' | 'danger';
}

/**
 * Reusable warning banner for modals
 */
export function WarningBanner({ title, message, variant = 'warning' }: WarningBannerProps) {
    const colorClasses =
        variant === 'danger'
            ? 'bg-red-50 border-red-200 text-red-800 text-red-600'
            : 'bg-yellow-50 border-yellow-200 text-yellow-800 text-yellow-600';

    return (
        <div className={`p-3 rounded-lg border ${colorClasses.split(' ').slice(0, 2).join(' ')}`}>
            <div className="flex gap-2">
                <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${colorClasses.split(' ').slice(-1)}`} />
                <div className="text-sm">
                    <p className="font-medium mb-1">{title}</p>
                    <p className={colorClasses.split(' ').slice(2, 3).join(' ')}>{message}</p>
                </div>
            </div>
        </div>
    );
}

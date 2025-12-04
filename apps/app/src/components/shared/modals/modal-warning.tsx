import { type LucideIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

type WarningVariant = 'orange' | 'red' | 'amber' | 'blue';

interface ModalWarningProps {
    variant: WarningVariant;
    title: string;
    children: React.ReactNode;
    icon?: LucideIcon;
}

const variantStyles: Record<
    WarningVariant,
    {
        container: string;
        iconBg: string;
        iconColor: string;
        title: string;
        text: string;
    }
> = {
    orange: {
        container: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
        iconBg: 'bg-orange-100 dark:bg-orange-900/50',
        iconColor: 'text-orange-600 dark:text-orange-400',
        title: 'text-orange-700 dark:text-orange-300',
        text: 'text-orange-700/80 dark:text-orange-300/80',
    },
    red: {
        container: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
        iconBg: 'bg-red-100 dark:bg-red-900/50',
        iconColor: 'text-red-600 dark:text-red-400',
        title: 'text-red-700 dark:text-red-300',
        text: 'text-red-700/80 dark:text-red-300/80',
    },
    amber: {
        container: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
        iconBg: 'bg-amber-100 dark:bg-amber-900/50',
        iconColor: 'text-amber-600 dark:text-amber-400',
        title: 'text-amber-700 dark:text-amber-300',
        text: 'text-amber-700/80 dark:text-amber-300/80',
    },
    blue: {
        container: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
        iconBg: 'bg-blue-100 dark:bg-blue-900/50',
        iconColor: 'text-blue-600 dark:text-blue-400',
        title: 'text-blue-700 dark:text-blue-300',
        text: 'text-blue-700/80 dark:text-blue-300/80',
    },
};

export function ModalWarning({ variant, title, children, icon: Icon = AlertTriangle }: ModalWarningProps) {
    const styles = variantStyles[variant];

    return (
        <div className={cn('rounded-2xl p-5 space-y-3 border', styles.container)}>
            <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-xl', styles.iconBg)}>
                    <Icon className={cn('h-5 w-5', styles.iconColor)} />
                </div>
                <span className={cn('font-semibold', styles.title)}>{title}</span>
            </div>
            <div className={cn('text-sm leading-relaxed', styles.text)}>{children}</div>
        </div>
    );
}

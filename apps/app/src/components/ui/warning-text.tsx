import { cn } from '@/lib/utils';

interface WarningTextProps {
    children: React.ReactNode;
    show?: boolean;
    size?: 'sm' | 'base';
    className?: string;
}

export function WarningText({ children, show = true, size = 'sm', className }: WarningTextProps) {
    if (!show) return null;

    return <p className={cn('text-red-500', size === 'sm' ? 'text-sm' : 'text-base', className)}>{children}</p>;
}

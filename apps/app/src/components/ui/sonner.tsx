'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast } from 'sonner';
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            icons={{
                success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
                error: <XCircle className="h-5 w-5 text-red-500" />,
                warning: <AlertCircle className="h-5 w-5 text-amber-500" />,
                info: <Info className="h-5 w-5 text-blue-500" />,
            }}
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:bg-zinc-900 group-[.toaster]:text-zinc-100 group-[.toaster]:border-zinc-800 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl font-berkeley-mono',
                    description: 'group-[.toast]:text-zinc-400',
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg',
                    cancelButton: 'group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-400 group-[.toast]:rounded-lg',
                    success: 'group-[.toaster]:border-green-500/20',
                    error: 'group-[.toaster]:border-red-500/20',
                    warning: 'group-[.toaster]:border-amber-500/20',
                    info: 'group-[.toaster]:border-blue-500/20',
                },
            }}
            {...props}
        />
    );
}

export { Toaster, toast };

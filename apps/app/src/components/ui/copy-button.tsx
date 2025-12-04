'use client';

import { useState, type ComponentProps } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface CopyButtonProps
    extends Omit<ComponentProps<'button'>, 'onClick' | 'children'>,
        ButtonVariantProps {
    textToCopy: string;
    displayText?: string;
    iconOnly?: boolean;
    iconClassName?: string;
    iconClassNameCheck?: string;
}

export function CopyButton({
    textToCopy,
    displayText,
    className,
    iconOnly = false,
    iconClassName,
    iconClassNameCheck,
    variant = 'outline',
    size = 'default',
    ...props
}: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            toast.success('Copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy to clipboard');
        }
    };

    const defaultIconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
    const iconSize = iconClassName ? undefined : defaultIconSize;

    if (iconOnly) {
        return (
            <Button
                variant={variant}
                size={size}
                onClick={handleCopy}
                className={cn('p-2', className)}
                title={copied ? 'Copied!' : 'Copy'}
                {...props}
            >
                {copied ? (
                    <Check className={cn('text-green-600 dark:text-green-400', iconSize, iconClassNameCheck)} />
                ) : (
                    <Copy className={cn(iconSize, iconClassName)} />
                )}
            </Button>
        );
    }

    return (
        <Button
            variant={variant}
            size={size}
            onClick={handleCopy}
            className={cn('inline-flex items-center gap-2', className)}
            {...props}
        >
            {displayText && <span className="font-mono">{displayText}</span>}
            {copied ? (
                <Check className={cn('text-green-600 dark:text-green-400', iconSize, iconClassNameCheck)} />
            ) : (
                <Copy className={cn(iconSize, iconClassName)} />
            )}
        </Button>
    );
}

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer rounded-[10px] font-semibold font-inter transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98]",
    {
        variants: {
            variant: {
                default:
                    'bg-[#EDEDF3] dark:bg-secondary text-primary dark:text-secondary-foreground hover:bg-[#DBDAE5]',
                destructive:
                    'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
                outline:
                    'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
                secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
                ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
                link: 'text-primary underline-offset-4 hover:underline',
            },
            size: {
                // Button/Lg: 16px, weight 600, line-height 18px, tracking -0.16px
                lg: 'h-10 rounded-md px-3 pr-4 text-[16px] leading-[18px] tracking-[-0.16px]',
                // Button/Md: 14px, weight 600, line-height 1.03, tracking -0.14px
                default: 'h-9 px-4 px-3 pr-4 text-[14px] leading-[1.03] tracking-[-0.14px]',
                // Button/Sm: 12px, weight 600, line-height 1.03, tracking -0.12px
                sm: 'h-8 rounded-md gap-1.5 px-3 pr-4 text-[12px] leading-[1.03] tracking-[-0.12px]',
                icon: 'size-8',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

const Button = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'> &
        VariantProps<typeof buttonVariants> & {
            asChild?: boolean;
        }
>(function Button({ className, variant, size, asChild = false, ...props }, ref) {
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp data-slot="button" ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
});

export { Button, buttonVariants };

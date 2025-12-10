'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface DecimalsSelectorProps {
    value: string;
    onChange: (value: string) => void;
    id?: string;
}

export function DecimalsSelector({ value, onChange, id }: DecimalsSelectorProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>Decimals</Label>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => onChange('6')}
                    className={cn(
                        'flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all',
                        value === '6'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40',
                    )}
                >
                    6
                </button>
                <button
                    type="button"
                    onClick={() => onChange('9')}
                    className={cn(
                        'flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all',
                        value === '9'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40',
                    )}
                >
                    9
                </button>
            </div>
            <p className="text-xs text-muted-foreground">
                {value === '6' ? 'Standard for stablecoins (like USDC)' : 'Standard for native tokens (like SOL)'}
            </p>
        </div>
    );
}

'use client';

import { useInputValidation } from '@/hooks/use-input-validation';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AmountInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    helpText?: string;
    disabled?: boolean;
    required?: boolean;
    showValidation?: boolean;
    min?: string;
    max?: string;
    step?: string;
    /** Available balance to show (formatted string) */
    balance?: string;
    /** Whether balance is currently loading */
    balanceLoading?: boolean;
    /** Callback when max button is clicked */
    onMaxClick?: () => void;
    /** Symbol to show next to balance (e.g., "USDC") */
    balanceSymbol?: string;
}

export function AmountInput({
    label,
    value,
    onChange,
    placeholder = '0.00',
    helpText,
    disabled = false,
    required = false,
    showValidation = true,
    min = '0',
    max,
    step = '0.000000001',
    balance,
    balanceLoading,
    onMaxClick,
    balanceSymbol,
}: AmountInputProps) {
    const { validateAmount } = useInputValidation();
    const isValid = !value || validateAmount(value);

    const stepValue = parseFloat(step) || 1;
    const minValue = parseFloat(min) || 0;
    const maxValue = max ? parseFloat(max) : undefined;

    const increment = () => {
        if (disabled) return;
        const currentValue = parseFloat(value) || 0;
        let newValue = currentValue + stepValue;
        if (maxValue !== undefined && newValue > maxValue) {
            newValue = maxValue;
        }
        // Handle floating point precision
        onChange(formatNumber(newValue));
    };

    const decrement = () => {
        if (disabled) return;
        const currentValue = parseFloat(value) || 0;
        let newValue = currentValue - stepValue;
        if (newValue < minValue) {
            newValue = minValue;
        }
        // Handle floating point precision
        onChange(formatNumber(newValue));
    };

    // Format number to avoid floating point issues
    const formatNumber = (num: number): string => {
        // Determine decimal places from step
        const stepStr = step.toString();
        const decimalPlaces = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;

        // Use toFixed for small numbers, but avoid trailing zeros for whole numbers
        if (num === 0) return '0';
        if (Number.isInteger(num)) return num.toString();

        // For very small numbers, use exponential notation
        if (Math.abs(num) < 0.000001) {
            return num.toExponential();
        }

        return parseFloat(num.toFixed(Math.max(decimalPlaces, 9))).toString();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        // Allow empty, numbers, decimals, and scientific notation (e.g., 7e-9)
        if (inputValue === '' || /^-?\d*\.?\d*(e[+-]?\d*)?$/i.test(inputValue)) {
            onChange(inputValue);
        }
    };

    const showBalance = balance !== undefined || balanceLoading;

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {showBalance && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {balanceLoading ? (
                            <span className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading...
                            </span>
                        ) : (
                            <>
                                <span>
                                    Balance: {balance} {balanceSymbol}
                                </span>
                                {onMaxClick && parseFloat(balance || '0') > 0 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={onMaxClick}
                                        disabled={disabled}
                                        className="h-5 px-1.5 text-xs text-primary hover:text-primary font-medium"
                                    >
                                        Max
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
            <div className="relative">
                <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={handleInputChange}
                    placeholder={placeholder}
                    className={cn(
                        'w-full h-11 px-3 pr-10 border rounded-xl bg-background text-sm',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        !isValid && value && 'border-red-500 focus:ring-red-500',
                    )}
                    disabled={disabled}
                />

                {/* Custom spinner buttons */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col overflow-hidden border-l border-primary/10 divide-y divide-primary/10">
                    <button
                        type="button"
                        onClick={increment}
                        disabled={disabled || (maxValue !== undefined && parseFloat(value) >= maxValue)}
                        className={cn(
                            'flex items-center justify-center w-7 h-4 rounded-tr-md',
                            'text-muted-foreground hover:text-foreground hover:bg-muted',
                            'transition-colors duration-150',
                            'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
                        )}
                        tabIndex={-1}
                        aria-label="Increase value"
                    >
                        <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                        type="button"
                        onClick={decrement}
                        disabled={disabled || parseFloat(value) <= minValue}
                        className={cn(
                            'flex items-center justify-center w-7 h-4 rounded-br-md',
                            'text-muted-foreground hover:text-foreground hover:bg-muted',
                            'transition-colors duration-150',
                            'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
                        )}
                        tabIndex={-1}
                        aria-label="Decrease value"
                    >
                        <ChevronDown className="h-3 w-3" />
                    </button>
                </div>
            </div>
            {helpText && <p className="text-xs text-muted-foreground mt-1.5">{helpText}</p>}
            {showValidation && value && !isValid && (
                <p className="text-sm text-red-600 mt-1">Please enter a valid positive amount</p>
            )}
        </div>
    );
}

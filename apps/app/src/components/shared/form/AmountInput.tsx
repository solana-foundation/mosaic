import { useInputValidation } from '@/hooks/useInputValidation';

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
}: AmountInputProps) {
    const { validateAmount } = useInputValidation();
    const isValid = !value || validateAmount(value);

    return (
        <div>
            <label className="block text-sm font-medium mb-2">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
                type="number"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                step={step}
                min={min}
                max={max}
                className="w-full p-2 border rounded-md"
                disabled={disabled}
            />
            {helpText && <p className="text-xs text-muted-foreground mt-1">{helpText}</p>}
            {showValidation && value && !isValid && (
                <p className="text-sm text-red-600 mt-1">Please enter a valid positive amount</p>
            )}
        </div>
    );
}
